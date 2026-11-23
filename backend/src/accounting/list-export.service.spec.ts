/** Every accounting list downloads as PDF, Word and Excel with its filters in the heading and a total row. Uses stand-in data, no database. */
import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import { ListExportService, LIST_EXPORT_VIEWS } from './list-export.service';

const user = { id: 'u1', role: 'MAMCOS_ACCOUNTANT', mamcosId: 'm1' } as any;
const scope = { mamcosId: 'm1' };

const prisma: any = {
  mamcos: { findUnique: async () => ({ name: 'Mayode AMCOS' }) },
  user: { findUnique: async () => ({ firstName: 'Asha', lastName: 'Juma', phone: '0700' }) },
};
const accounting: any = {
  journalEntries: async () => [{ entryDate: new Date('2026-03-04T10:00:00Z'), entryNumber: 'JE-1', description: 'Paddy bought', sourceType: 'Bill', reversed: false, totalDebit: 500, totalCredit: 500,
    lines: [{ account: { code: '5000', name: 'Purchases' }, debit: 500, credit: 0 }, { account: { code: '1000', name: 'Cash' }, debit: 0, credit: 500 }] }],
  receivables: async () => [{ invoiceNumber: 'INV-1', buyer: { name: 'Buyer Ltd' }, dueDate: new Date('2026-04-01'), amount: 1000, total: 1000, amountPaid: 250, balance: 750, status: 'OPEN' }],
  payables: async () => [{ billNumber: 'B-1', supplier: 'Seeds Co', dueDate: new Date('2026-04-01'), amount: 900, amountPaid: 0, balance: 900, status: 'OVERDUE' }],
  documents: async () => [{ invoiceNumber: 'INV-2', buyer: null, description: 'Rice', dueDate: new Date('2026-02-01'), amount: 400, amountPaid: 400, balance: 0, status: 'PAID' }],
  findAllBudgets: async () => [{ name: 'Season 2026', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), status: 'APPROVED', lines: [{ accountId: 'a1', amount: 1200 }] }],
  listAccounts: async () => [{ id: 'a1', code: '5000', name: 'Purchases' }],
};
const cash: any = { list: async () => ({ count: 1, total: 300, pending: 0, items: [{ date: '2026-03-05', number: 'EX-1', category: 'Fuel', party: 'Station', account: 'Cash', vatAmount: 0, amount: 300, status: 'POSTED' }] }) };
const cashAccounts: any = { cashBook: async () => ({ account: 'All money accounts', opening: 100, closing: 150, totalIn: 100, totalOut: 50, rows: [{ date: new Date('2026-03-05T08:00:00Z'), number: 'JE-2', description: 'Levy', account: 'Cash', moneyIn: 100, moneyOut: 0, balance: 200 }] }) };
const farmerAccounts: any = { owed: async () => ({ totalOwed: 80, totalPaid: 20, totalDebts: 5, items: [{ name: 'Neema', memberNumber: 'M-1', phone: '0711', bought: 100, paid: 20, owed: 80, debts: 5 }] }) };
const reports: any = { build: async (kind: string) => ({ amcosName: 'Mayode AMCOS', kind, heading: `${kind} heading`, periodLine: 'p', currency: 'TZS', notes: [], preparedBy: 'x', approvedBy: null, generatedAt: 'now',
  tables: [{ columns: [{ label: 'Code' }, { label: 'Name' }, { label: 'Amount', align: 'right' as const }], rows: [{ cells: ['1000', 'Cash', 10] }] }] }) };

const svc = new ListExportService(prisma, accounting, cash, cashAccounts, farmerAccounts, reports);

const csv = async (view: any, status?: string) => {
  const wb = XLSX.read((await svc.export(user, scope, { view, format: 'XLSX', status })).buffer, { type: 'buffer' });
  return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
};

describe('accounting list exports', () => {
  it.each(LIST_EXPORT_VIEWS)('%s renders in PDF, Word and Excel', async (view) => {
    for (const format of ['PDF', 'DOCX', 'XLSX'] as const) {
      const f = await svc.export(user, scope, { view, format });
      expect(f.buffer.length).toBeGreaterThan(500);
      expect(f.fileName).toMatch(new RegExp(`\\.${format === 'PDF' ? 'pdf' : format === 'DOCX' ? 'docx' : 'xlsx'}$`));
    }
  });

  it('the Excel file has the cooperative name, the heading, the rows and a total', async () => {
    const f = await svc.export(user, scope, { view: 'expenses', format: 'XLSX', from: '2026-03-01', to: '2026-03-31', q: 'fuel' });
    const sheet = XLSX.read(f.buffer, { type: 'buffer' });
    const text = XLSX.utils.sheet_to_csv(sheet.Sheets[sheet.SheetNames[0]]);
    expect(text).toContain('MAYODE AMCOS');
    expect(text).toContain('Expenses as at');
    expect(text).toContain('From 1 March 2026 to 31 March 2026');
    expect(text).toContain('Search: “fuel”');
    expect(text).toContain('Fuel');
    expect(text).toContain('Total · 1 posted');
  });

  it('unpaid invoices use the receivables list, settled ones the documents list', async () => {
    expect(await csv('invoices', 'unpaid')).toContain('INV-1');
    expect(await csv('invoices', 'PAID')).toContain('INV-2');
    expect(await csv('bills', 'unpaid')).toContain('Seeds Co');
  });

  it('refuses a start date after the end date and a badly written date', async () => {
    await expect(svc.export(user, scope, { view: 'journal', format: 'PDF', from: '2026-05-01', to: '2026-04-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.export(user, scope, { view: 'journal', format: 'PDF', from: '1/5/2026' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
