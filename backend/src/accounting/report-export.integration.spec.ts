/** PDF / Word / Excel statements and their archive, against the throw-away `irrigation_test` schema. Skipped unless IRRIGATION_TEST_DATABASE_URL is set. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from './accounting.service';
import { ReportExportService } from './report-export.service';
import { REPORT_KINDS } from './exports/report-titles';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Accounting report exports (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let acct: AccountingService; let svc: ReportExportService;
  let mamcosA: string; let mamcosB: string; let accountant: RequestUser; let other: RequestUser; let name: string;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    acct = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    svc = new ReportExportService(prisma as any, acct);
    const tag = randomUUID().slice(0, 5);
    name = `Madibira Export ${tag}`;
    mamcosA = (await prisma.mamcos.create({ data: { name } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku Export ${tag}` } })).id;
    const user = await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8)}`, passwordHash: 'x', firstName: 'Neema', lastName: 'Accountant', role: UserRole.CUSTOM, mamcosId: mamcosA } });
    accountant = { id: user.id, role: UserRole.CUSTOM, mamcosId: mamcosA };
    other = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosB };
    const d = (s: string) => new Date(`${s}T10:00:00+03:00`);
    await acct.postToLedger('Sale', `e-sale-1-${tag}`, d('2026-02-10'), 'Rice sale February', [{ code: '1000', debit: 5000 }, { code: '4000', credit: 5000 }], mamcosA);
    await acct.postToLedger('Expense', `e-exp-1-${tag}`, d('2026-03-05'), 'Fuel', [{ code: '5600', debit: 800 }, { code: '1000', credit: 800 }], mamcosA);
    await acct.postToLedger('MemberContribution', `e-cap-1-${tag}`, d('2025-11-20'), 'Members capital', [{ code: '1000', debit: 2000 }, { code: '3000', credit: 2000 }], mamcosA);
    await acct.postToLedger('Sale', `e-sale-b-${tag}`, d('2026-02-11'), 'Other AMCOS sale', [{ code: '1000', debit: 99 }, { code: '4000', credit: 99 }], mamcosB);
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  const scope = () => acct.scopeFor(accountant);
  const fetchFile = async (id: string) => Buffer.from((await svc.file(scope(), id)).content);

  it('builds every statement for a year with the official heading and the right figures', async () => {
    const ci = await svc.build('COMPREHENSIVE_INCOME', scope(), '2026-01-01', '2026-12-31', { preparedBy: 'Neema', approvedBy: null });
    expect(ci.amcosName).toBe(name);
    expect(ci.heading).toBe('Statement of Comprehensive Income for the Year Ended 31 December 2026');
    const flat = (d: any) => JSON.stringify(d.tables);
    expect(flat(ci)).toContain('5000'); // total revenue
    expect(flat(ci)).toContain('4200'); // surplus 5000 − 800

    const fp = await svc.build('FINANCIAL_POSITION', scope(), '2026-12-31', '2026-12-31', { preparedBy: 'N', approvedBy: null });
    expect(fp.heading).toBe('Statement of Financial Position as at 31 December 2026');
    expect(flat(fp)).toContain('6200'); // assets 2000 + 5000 − 800

    const eq = await svc.build('CHANGES_IN_EQUITY', scope(), '2026-01-01', '2026-12-31', { preparedBy: 'N', approvedBy: null });
    const total = eq.tables[0].rows.at(-1)!.cells;
    expect(total).toEqual(['Total equity', 2000, 4200, 0, 6200]); // opening capital, surplus for the year, closing = total equity of the balance sheet

    const gl = await svc.build('GENERAL_LEDGER', scope(), '2026-01-01', '2026-12-31', { preparedBy: 'N', approvedBy: null });
    expect(gl.heading).toBe('General Ledger for the Period 1 January 2026 to 31 December 2026');
    const cash = gl.tables.find((t) => t.heading?.startsWith('1000'))!;
    expect(cash.rows[0].cells[5]).toBe(2000);        // opening balance carried from 2025
    expect(cash.rows.at(-1)!.cells[5]).toBe(6200);   // running balance closes at 6,200
    expect(flat(gl)).not.toContain('Other AMCOS');   // another cooperative's books never appear

    const cf = await svc.build('CASH_FLOWS', scope(), '2026-01-01', '2026-12-31', { preparedBy: 'N', approvedBy: null });
    expect(flat(cf)).toContain('6200');
  });

  it('writes valid PDF, Word and Excel files for all seven statements and archives each one', async () => {
    for (const report of REPORT_KINDS) {
      for (const format of ['PDF', 'DOCX', 'XLSX'] as const) {
        const row = await svc.generate(scope(), accountant, { report, format, year: 2026, approvedBy: 'Chairman' } as any);
        const bytes = await fetchFile(row.id);
        expect(bytes.length).toBe(row.sizeBytes);
        if (format === 'PDF') expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        if (format === 'DOCX') {
          const xml = strFromU8(unzipSync(new Uint8Array(bytes))['word/document.xml']);
          expect(xml).toContain(name.toUpperCase());
          expect(xml).toContain(row.title.replace(/&/g, '&amp;'));
          expect(xml).toContain('Chairman');
        }
        if (format === 'XLSX') {
          const wb = XLSX.read(bytes);
          const cells = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
          expect(cells[0][0]).toBe(name.toUpperCase());
          expect(cells[1][0]).toBe(row.title);
        }
      }
    }
    expect((await svc.list(scope())).length).toBe(21);
  });

  it('keeps the Excel figures numeric so they can be calculated on', async () => {
    const row = await svc.generate(scope(), accountant, { report: 'TRIAL_BALANCE', format: 'XLSX', to: '2026-12-31' } as any);
    const wb = XLSX.read(await fetchFile(row.id));
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const cash = rows.find((r) => r[0] === '1000')!;
    expect(cash[2]).toBe(6200);
    expect(row.title).toBe('Trial Balance as at 31 December 2026');
  });

  it('takes a month or a custom range, and filters the archive', async () => {
    const month = await svc.generate(scope(), accountant, { report: 'COMPREHENSIVE_INCOME', format: 'PDF', year: 2026, month: 2 } as any);
    expect(month.title).toBe('Statement of Comprehensive Income for the Period Ended 28 February 2026');
    const custom = await svc.generate(scope(), accountant, { report: 'CASH_FLOWS', format: 'DOCX', from: '2026-01-01', to: '2026-06-30' } as any);
    expect(custom.title).toBe('Statement of Cash Flows for the Period Ended 30 June 2026');
    expect((await svc.list(scope(), { report: 'CASH_FLOWS', format: 'DOCX' })).map((r) => r.id)).toContain(custom.id);
    await expect(svc.generate(scope(), accountant, { report: 'CASH_FLOWS', format: 'PDF', from: '2026-07-01', to: '2026-06-30' } as any)).rejects.toThrow(BadRequestException);
    await expect(svc.generate(scope(), accountant, { report: 'CASH_FLOWS', format: 'PDF' } as any)).rejects.toThrow(BadRequestException);
  });

  it('shows another cooperative none of this archive', async () => {
    const mine = (await svc.list(scope()))[0];
    expect(await svc.list(acct.scopeFor(other))).toEqual([]);
    await expect(svc.file(acct.scopeFor(other), mine.id)).rejects.toThrow(NotFoundException);
  });
});
