import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, PaymentType, PayoutStatus } from '@prisma/client';
import { ClickPesaService } from '../payments/clickpesa.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../messaging/sms.service';
import { CreateLoanDto } from './dto/loans.dto';
import { calculateLoanDeductions } from './deduction';
import { AccountingService } from '../accounting/accounting.service';

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clickPesa: ClickPesaService,
    private readonly sms: SmsService,
    private readonly accounting: AccountingService,
  ) {}

  async create(dto: CreateLoanDto) {
    const loan = await this.prisma.loanRecord.create({ data: dto });
    await this.accounting.postToLedger(
      'LoanDisbursement',
      loan.id,
      loan.createdAt,
      `Loan disbursement: ${loan.lenderName}`,
      [
        { code: '1000', debit: loan.originalAmount },
        { code: '2000', credit: loan.originalAmount },
      ],
    );
    return loan;
  }
  listForFarmer(farmerId: string) {
    return this.prisma.loanRecord.findMany({
      where: { farmerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async applyDeductionsForSale(saleId: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        saleId,
        paymentType: PaymentType.RICE_PURCHASE,
        status: PaymentStatus.CLEARED,
      },
      include: { loanDeductions: true },
    });
    const result = await this.prisma.$transaction(async (tx) => {
      for (const payment of payments) {
        if (payment.loanDeductions.length) continue;
        const loans = await tx.loanRecord.findMany({
          where: {
            farmerId: payment.farmerId,
            isActive: true,
            amountOwed: { gt: 0 },
            autoDeductPercent: { gt: 0 },
          },
          orderBy: { createdAt: 'asc' },
        });
        const calculation = calculateLoanDeductions(payment.amount, loans);
        for (const planned of calculation.deductions) {
          const loan = loans.find((item) => item.id === planned.loanId)!;
          const deduction = planned.amount;
          await tx.loanDeduction.create({
            data: {
              loanRecordId: loan.id,
              sourcePaymentId: payment.id,
              amount: deduction,
            },
          });
          const owed = Math.max(0, loan.amountOwed - deduction);
          await tx.loanRecord.update({
            where: { id: loan.id },
            data: { amountOwed: owed, isActive: owed > 0 },
          });
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            loanDeduction: calculation.totalDeduction || null,
            netAmount: calculation.netAmount,
          },
        });
      }
      return tx.payment.findMany({
        where: { saleId },
        include: { loanDeductions: { include: { loanRecord: true } } },
      });
    });
    await Promise.all(
      result.flatMap((payment) =>
        payment.loanDeductions.map((deduction) =>
          this.accounting.postToLedger(
            'LoanDeduction',
            deduction.id,
            deduction.createdAt,
            `Loan deduction for payment ${payment.id}`,
            [
              { code: '2200', debit: deduction.amount },
              { code: '2000', credit: deduction.amount },
            ],
          ),
        ),
      ),
    );
    return result;
  }

  async approveAndInitiateSalePayouts(
    saleId: string,
    approvedByUserId: string,
  ) {
    if (!this.clickPesa.isConfigured())
      throw new ConflictException(
        'ClickPesa is not configured; no real payouts can be approved.',
      );
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        payments: {
          include: {
            farmer: { include: { user: true } },
            loanDeductions: { include: { loanRecord: true } },
          },
        },
      },
    });
    if (!sale?.paymentReceived)
      throw new BadRequestException(
        'Buyer payment must be settled before payouts are approved',
      );
    if (!sale) throw new NotFoundException(`Sale with ID ${saleId} not found`);
    const results: string[] = [];
    const approvedAt = new Date();
    for (const payment of sale.payments.filter(
      (item) => item.status === PaymentStatus.CLEARED,
    )) {
      for (const deduction of payment.loanDeductions.filter(
        (item) => item.payoutStatus === PayoutStatus.PENDING,
      )) {
        if (!deduction.loanRecord.lenderPayoutPhone)
          throw new BadRequestException(
            `Loan ${deduction.loanRecord.id} has no lender payout phone`,
          );
        const ref = `LOAN-${deduction.id.slice(0, 8)}-${Date.now()}`;
        await this.clickPesa.initiateMobilePayout({
          amount: deduction.amount.toFixed(2),
          orderReference: ref,
          phoneNumber: deduction.loanRecord.lenderPayoutPhone,
          recipientName:
            deduction.loanRecord.lenderPayoutName ??
            deduction.loanRecord.lenderName,
        });
        await this.prisma.loanDeduction.update({
          where: { id: deduction.id },
          data: {
            orderReference: ref,
            payoutStatus: PayoutStatus.PROCESSING,
            payoutApprovedByUserId: approvedByUserId,
            payoutApprovedAt: approvedAt,
          },
        });
        await this.prisma.payment.create({
          data: {
            farmerId: payment.farmerId,
            saleId,
            amount: deduction.amount,
            netAmount: deduction.amount,
            paymentType: PaymentType.LOAN_REPAYMENT,
            status: PaymentStatus.PENDING,
            orderReference: ref,
            payoutApprovedByUserId: approvedByUserId,
            payoutApprovedAt: approvedAt,
            description: `Loan repayment to ${deduction.loanRecord.lenderName} for sale ${sale.invoiceNumber}`,
          },
        });
        results.push(ref);
      }
      const net = payment.netAmount ?? payment.amount;
      if (net > 0) {
        const ref = `FARMER-${payment.id.slice(0, 8)}-${Date.now()}`;
        await this.clickPesa.initiateMobilePayout({
          amount: net.toFixed(2),
          orderReference: ref,
          phoneNumber: payment.farmer.user.phone,
          recipientName: `${payment.farmer.firstName} ${payment.farmer.lastName}`,
        });
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            orderReference: ref,
            status: PaymentStatus.PENDING,
            payoutApprovedByUserId: approvedByUserId,
            payoutApprovedAt: approvedAt,
          },
        });
        if (payment.paymentType === PaymentType.RICE_PURCHASE)
          await this.sms.sendPaymentBreakdown({
            phone: payment.farmer.user.phone,
            grossAmount: payment.amount,
            loanDeduction: payment.loanDeduction ?? 0,
            netAmount: net,
            invoiceNumber: sale.invoiceNumber,
          });
        results.push(ref);
      }
    }
    return { initiated: results };
  }

  async reconcileSalePayouts(saleId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { saleId },
      include: { loanDeductions: true },
    });
    const reconciled: string[] = [];
    for (const payment of payments) {
      for (const deduction of payment.loanDeductions.filter(
        (item) =>
          item.orderReference && item.payoutStatus === PayoutStatus.PROCESSING,
      )) {
        const status = await this.clickPesa.queryPayoutStatus(
          deduction.orderReference!,
        );
        if (!status) continue;
        const payoutStatus =
          status.status === 'SUCCESS'
            ? PayoutStatus.SUCCESS
            : status.status === 'FAILED'
              ? PayoutStatus.FAILED
              : PayoutStatus.PROCESSING;
        await this.prisma.loanDeduction.update({
          where: { id: deduction.id },
          data: { payoutStatus },
        });
        if (payoutStatus === PayoutStatus.SUCCESS) {
          await this.prisma.payment.updateMany({
            where: { orderReference: deduction.orderReference },
            data: { status: PaymentStatus.RELEASED, paidAt: new Date() },
          });
          await this.accounting.postToLedger(
            'LenderRemittance',
            deduction.id,
            new Date(),
            `Lender remittance ${deduction.id}`,
            [
              { code: '2000', debit: deduction.amount },
              { code: '1000', credit: deduction.amount },
            ],
          );
        }
        if (payoutStatus === PayoutStatus.FAILED)
          await this.prisma.payment.updateMany({
            where: { orderReference: deduction.orderReference },
            data: { status: PaymentStatus.FAILED },
          });
        reconciled.push(deduction.orderReference!);
      }
      if (
        payment.orderReference &&
        payment.status === PaymentStatus.PENDING &&
        payment.paymentType !== PaymentType.LOAN_REPAYMENT
      ) {
        const status = await this.clickPesa.queryPayoutStatus(
          payment.orderReference,
        );
        if (status?.status === 'SUCCESS') {
          const paidAt = new Date();
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.RELEASED, paidAt },
          });
          await this.accounting.postToLedger(
            'FarmerPayout',
            payment.id,
            paidAt,
            `Farmer payout ${payment.id}`,
            [
              { code: '2200', debit: payment.netAmount ?? payment.amount },
              { code: '1000', credit: payment.netAmount ?? payment.amount },
            ],
          );
        }
        if (status?.status === 'FAILED')
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.FAILED },
          });
        if (status) reconciled.push(payment.orderReference);
      }
    }
    return { reconciled };
  }
}
