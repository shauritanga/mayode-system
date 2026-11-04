import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService, LedgerScope } from './accounting.service';
import { round2, bookingMoment } from './tax';

export class TaxSettingsInput {
  tin?: string | null;
  vrn?: string | null;
  vatRegistered?: boolean;
  vatRate?: number;
}

/** VAT and withholding tax: cooperative tax settings, the VAT return, and paying what is owed to the revenue authority. */
@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService, private readonly accounting: AccountingService) {}

  private mamcos(scope: LedgerScope): string {
    if (!scope.mamcosId) throw new BadRequestException('Choose a cooperative first.');
    return scope.mamcosId;
  }
  private end(day?: string) {
    return day ? new Date(`${day}T23:59:59.999+03:00`) : new Date();
  }
  /** Net balance of one account, debit-positive, for a cooperative within an optional window and optional source types. */
  private async net(mamcosId: string, code: string, opts: { from?: string; to?: string; sourceTypes?: string[] } = {}) {
    const sums = await this.prisma.ledgerEntry.aggregate({
      where: {
        mamcosId, account: { code },
        ...(opts.sourceTypes ? { sourceType: { in: opts.sourceTypes } } : {}),
        ...(opts.from || opts.to ? { entryDate: { ...(opts.from ? { gte: new Date(`${opts.from}T00:00:00+03:00`) } : {}), ...(opts.to ? { lte: this.end(opts.to) } : {}) } } : {}),
      },
      _sum: { debit: true, credit: true },
    });
    return round2((sums._sum.debit ?? 0) - (sums._sum.credit ?? 0));
  }

  async settings(scope: LedgerScope) {
    const m = await this.prisma.mamcos.findUnique({ where: { id: this.mamcos(scope) }, select: { name: true, tin: true, vrn: true, vatRegistered: true, vatRate: true } });
    if (!m) throw new BadRequestException('Cooperative not found');
    return { name: m.name, tin: m.tin, vrn: m.vrn, vatRegistered: m.vatRegistered, vatRate: Number(m.vatRate) };
  }
  async updateSettings(dto: TaxSettingsInput, scope: LedgerScope) {
    const id = this.mamcos(scope);
    if (dto.vatRate != null && (dto.vatRate < 0 || dto.vatRate > 100)) throw new BadRequestException('VAT rate must be between 0 and 100.');
    const next = await this.settings(scope);
    if ((dto.vatRegistered ?? next.vatRegistered) && !(dto.vrn ?? next.vrn)?.trim()) {
      throw new BadRequestException('A VAT-registered cooperative needs its VAT registration number (VRN).');
    }
    await this.prisma.mamcos.update({
      where: { id },
      data: {
        ...(dto.tin !== undefined ? { tin: dto.tin?.trim() || null } : {}),
        ...(dto.vrn !== undefined ? { vrn: dto.vrn?.trim() || null } : {}),
        ...(dto.vatRegistered !== undefined ? { vatRegistered: dto.vatRegistered } : {}),
        ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
      },
    });
    return this.settings(scope);
  }

  /** Output VAT on sales, input VAT on purchases, what is owed, plus withholding tax, for a period. */
  async vatReturn(scope: LedgerScope, from: string, to: string) {
    const mamcosId = this.mamcos(scope);
    const [outputVat, inputVat, outputBalance, inputBalance, whtPayable, whtCredit] = await Promise.all([
      this.net(mamcosId, '2400', { from, to, sourceTypes: ['Invoice'] }).then((n) => -n),
      this.net(mamcosId, '1400', { from, to, sourceTypes: ['Bill'] }),
      this.net(mamcosId, '2400', { to }).then((n) => -n),
      this.net(mamcosId, '1400', { to }),
      this.net(mamcosId, '2410', { to }).then((n) => -n),
      this.net(mamcosId, '1410', { to }),
    ]);
    const window = { gte: new Date(`${from}T00:00:00+03:00`), lte: this.end(to) };
    const [invoices, bills] = await Promise.all([
      this.prisma.invoice.findMany({ where: { mamcosId, status: { not: 'VOID' }, postedToLedger: true, createdAt: window }, orderBy: { createdAt: 'asc' }, select: { invoiceNumber: true, createdAt: true, subtotal: true, vatAmount: true, amount: true, withholdingAmount: true } }),
      this.prisma.bill.findMany({ where: { mamcosId, status: { not: 'VOID' }, createdAt: window }, orderBy: { createdAt: 'asc' }, select: { billNumber: true, supplier: true, createdAt: true, subtotal: true, vatAmount: true, amount: true, withholdingAmount: true } }),
    ]);
    return {
      period: { from, to },
      outputVat, inputVat, netVatPayable: round2(outputVat - inputVat),
      // Everything still unsettled up to the end date (output minus input), after any payments made to the authority.
      vatOwedToDate: round2(outputBalance - inputBalance),
      withholdingPayableToDate: whtPayable,
      withholdingCreditToDate: whtCredit,
      sales: invoices.map((i) => ({ number: i.invoiceNumber, date: i.createdAt, net: i.subtotal ?? i.amount, vat: i.vatAmount, total: i.amount, withheld: i.withholdingAmount })),
      purchases: bills.map((b) => ({ number: b.billNumber, supplier: b.supplier, date: b.createdAt, net: b.subtotal ?? b.amount, vat: b.vatAmount, total: b.amount, withheld: b.withholdingAmount })),
    };
  }

  /** Pays the VAT return: clears output VAT against input VAT and books the cash difference. */
  async settleVat(dto: { through: string; paidOn: string; reference?: string }, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const out = -(await this.net(mamcosId, '2400', { to: dto.through }));
    const inn = await this.net(mamcosId, '1400', { to: dto.through });
    if (out === 0 && inn === 0) throw new BadRequestException('There is no VAT to settle up to that date.');
    const payment = round2(out - inn);
    const id = randomUUID();
    const lines = [
      { code: '2400', debit: out > 0 ? out : 0, credit: out < 0 ? -out : 0 },
      { code: '1400', credit: inn > 0 ? inn : 0, debit: inn < 0 ? -inn : 0 },
      { code: '1000', credit: payment > 0 ? payment : 0, debit: payment < 0 ? -payment : 0 },
    ].filter((l) => l.debit || l.credit);
    await this.accounting.postToLedger('VatSettlement', id, bookingMoment(dto.paidOn),
      `VAT ${payment >= 0 ? 'paid to' : 'refunded by'} the revenue authority up to ${dto.through}${dto.reference ? ` (${dto.reference})` : ''}`, lines, mamcosId, actorId);
    return { settled: id, outputVat: out, inputVat: inn, paid: payment };
  }

  /** Pays withheld tax over to the revenue authority. */
  async remitWithholding(dto: { amount: number; paidOn: string; reference?: string }, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const owed = -(await this.net(mamcosId, '2410'));
    const amount = round2(dto.amount);
    if (amount <= 0) throw new BadRequestException('Enter the amount paid.');
    if (amount > owed + 0.005) throw new BadRequestException(`Only ${owed.toLocaleString('en-US')} of withheld tax is owed.`);
    await this.accounting.postToLedger('WithholdingRemittance', randomUUID(), bookingMoment(dto.paidOn),
      `Withholding tax paid to the revenue authority${dto.reference ? ` (${dto.reference})` : ''}`,
      [{ code: '2410', debit: amount }, { code: '1000', credit: amount }], mamcosId, actorId);
    return { remitted: amount, stillOwed: round2(owed - amount) };
  }
}
