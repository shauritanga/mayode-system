/**
 * Integration tests for the staff task tools (cash drawer, input distribution, purchase orders, maintenance, compliance checklist, plot loans)
 * against the throw-away `irrigation_test` schema. Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { AccountingService } from '../accounting/accounting.service';
import { LoansService } from '../loans/loans.service';
import { CashDrawerService } from './cash-drawer.service';
import { InputDistributionService } from './input-distribution.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { MaintenanceService } from './maintenance.service';
import { ComplianceReportService } from './compliance-report.service';
import { InputDistributionController, PurchaseOrdersController, CashDrawerController } from './staff-tasks.controller';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describeDb('Staff task tools (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient;
  let drawer: CashDrawerService; let inputs: InputDistributionService; let orders: PurchaseOrdersService; let maint: MaintenanceService; let compliance: ComplianceReportService;
  let mamcosA: string; let mamcosB: string; let tag: string;
  let cashier: RequestUser; let accountant: RequestUser; let procurement: RequestUser; let manager: RequestUser; let outsider: RequestUser;
  const texts: { to: string; text: string }[] = [];
  const grants = (list: [string, string][]) => ({ isActive: true, isSystem: false, permissions: list.map(([resource, action]) => ({ action, resource: { key: resource } })) });
  const mkUser = async (mamcosId: string, phone?: string, language = 'sw') => (await prisma.user.create({ data: { phone: phone ?? `+2556${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId, firstName: 'U', lastName: 'Test', language } as any })).id;
  const actor = async (mamcosId: string, list: [string, string][]) => ({ id: await mkUser(mamcosId), role: UserRole.CUSTOM, mamcosId, customRole: grants(list) } as RequestUser);

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    const accounting = new AccountingService(prisma as any, ownership);
    const sms: any = { send: async (to: string, text: string) => { texts.push({ to, text }); } };
    drawer = new CashDrawerService(prisma as any, ownership);
    inputs = new InputDistributionService(prisma as any, ownership, accounting, sms);
    orders = new PurchaseOrdersService(prisma as any, ownership);
    maint = new MaintenanceService(prisma as any, ownership);
    compliance = new ComplianceReportService(prisma as any, ownership);
    tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Staff A ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Staff B ${tag}` } })).id;
    cashier = await actor(mamcosA, [['cash_drawer', 'VIEW'], ['cash_drawer', 'CREATE']]);
    accountant = await actor(mamcosA, [['cash_drawer', 'VIEW'], ['cash_drawer', 'EDIT']]);
    procurement = await actor(mamcosA, [['input_distribution', 'VIEW'], ['input_distribution', 'CREATE'], ['input_distribution', 'EDIT'], ['purchase_orders', 'VIEW'], ['purchase_orders', 'CREATE'], ['purchase_orders', 'EDIT'], ['maintenance_schedule', 'VIEW'], ['maintenance_schedule', 'CREATE'], ['maintenance_schedule', 'EDIT']]);
    manager = await actor(mamcosA, [['purchase_orders', 'VIEW'], ['purchase_order_approval', 'EDIT'], ['governance', 'VIEW']]);
    outsider = await actor(mamcosB, [['cash_drawer', 'VIEW'], ['cash_drawer', 'CREATE'], ['purchase_orders', 'VIEW']]);
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  const route = (cls: any, method: string) => Reflect.getMetadata(PERMISSION_KEY, cls.prototype[method]);

  it('guards each route with its own permission, keeping approval apart from drafting', () => {
    expect(route(CashDrawerController, 'close')).toMatchObject({ resource: 'cash_drawer', action: 'CREATE' });
    expect(route(CashDrawerController, 'receive')).toMatchObject({ resource: 'cash_drawer', action: 'EDIT' });
    expect(route(InputDistributionController, 'issue')).toMatchObject({ resource: 'input_distribution', action: 'CREATE' });
    expect(route(PurchaseOrdersController, 'create')).toMatchObject({ resource: 'purchase_orders', action: 'CREATE' });
    expect(route(PurchaseOrdersController, 'approve')).toMatchObject({ resource: 'purchase_order_approval', action: 'EDIT' });
  });

  describe('cash drawer', () => {
    let farmerId: string; let dueId: string; let closeId: string;
    beforeAll(async () => {
      farmerId = (await prisma.farmer.create({ data: { userId: await mkUser(mamcosA), controlNumber: `CD-${tag}`, firstName: 'Pay', lastName: 'Er', mamcosId: mamcosA } })).id;
      dueId = (await prisma.farmerDue.create({ data: { mamcosId: mamcosA, farmerId, category: 'FERTILISER', description: 'x', amount: 500_000, issuedOn: new Date(ymd(-3)) } })).id;
      const pay = (amount: number, method: any, n: number, by: string) => prisma.duePayment.create({ data: { mamcosId: mamcosA, dueId, farmerId, receiptNo: `R-${tag}-${n}`, amount, paidOn: new Date(ymd(0)), method, recordedById: by } });
      await pay(100_000, 'CASH', 1, cashier.id); await pay(50_000, 'CASH', 2, cashier.id); await pay(70_000, 'MOBILE_MONEY', 3, cashier.id); await pay(999_000, 'CASH', 4, accountant.id);
    });

    it("tallies only this cashier's receipts, split by how they were paid", async () => {
      const t: any = await drawer.mine(cashier);
      expect(t).toMatchObject({ cash: 150_000, mobile: 70_000, bank: 0, payments: 3, closed: null });
    });

    it('needs an explanation for a difference, then closes once per day', async () => {
      await expect(drawer.close(cashier, { countedCash: 140_000 })).rejects.toThrow(/short by TZS 10,000/);
      const c: any = await drawer.close(cashier, { countedCash: 140_000, note: 'A 10,000 note was a counterfeit' });
      closeId = c.id;
      expect(c).toMatchObject({ expectedCash: 150_000, countedCash: 140_000, variance: -10_000, status: 'SUBMITTED' });
      await expect(drawer.close(cashier, { countedCash: 150_000 })).rejects.toBeInstanceOf(ConflictException);
      expect(((await drawer.mine(cashier)) as any).closed.id).toBe(closeId);
    });

    it('lets the accountant receive it, but never the cashier and never from another cooperative', async () => {
      expect(((await drawer.list(cashier, {})) as any).data).toHaveLength(1);
      await expect(drawer.receive(cashier, closeId, { note: 'ok' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(drawer.receive(accountant, closeId, {})).rejects.toThrow(/write what you decided/);
      await expect(drawer.receive(outsider, closeId, { note: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      const r: any = await drawer.receive(accountant, closeId, { note: 'Counterfeit note kept for the police' });
      expect(r.status).toBe('RECEIVED');
      await expect(drawer.receive(accountant, closeId, { note: 'again' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to close a future day or a day with nothing in it', async () => {
      await expect(drawer.close(cashier, { day: ymd(2), countedCash: 0 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(drawer.close(cashier, { day: ymd(-1), countedCash: 0 })).rejects.toThrow(/nothing to close/);
    });
  });

  describe('input distribution', () => {
    let farmerId: string; let itemId: string; let issueId: string; let code: string;
    beforeAll(async () => {
      const userId = await mkUser(mamcosA, '+255700111222');
      farmerId = (await prisma.farmer.create({ data: { userId, controlNumber: `IN-${tag}`, firstName: 'Input', lastName: 'Farmer', mamcosId: mamcosA } })).id;
      itemId = (await prisma.farmInputItem.create({ data: { mamcosId: mamcosA, name: `Urea ${tag}`, type: 'FERTILIZER' as any, unit: 'kg', unitCost: 2_000 } })).id;
      await prisma.farmInputMovement.create({ data: { itemId, type: 'IN', quantity: 100, note: 'opening', createdByUserId: procurement.id } });
    });
    const balance = async () => (await prisma.farmInputMovement.aggregate({ where: { itemId }, _sum: { quantity: true } }))._sum.quantity;

    it('hands out stock on credit: stock down, a charge on the farmer, a ledger entry and a code texted to the farmer', async () => {
      const r: any = await inputs.issue(procurement, { farmerId, itemId, quantity: 30 });
      issueId = r.id;
      expect(r.amount).toBe(60_000);
      expect(await balance()).toBe(70);
      const due = await prisma.farmerDue.findFirstOrThrow({ where: { farmerId, itemName: `Urea ${tag}` } });
      expect(Number(due.amount)).toBe(60_000);
      expect(due.postedIssue).toBe(true);
      const sent = texts.filter((t) => t.to === '+255700111222').pop()!;
      code = sent.text.match(/\b(\d{6})\b/)![1];
      expect(sent.text).toContain(r.reference);
    });

    it('refuses more than is in stock, and a farmer of another cooperative', async () => {
      await expect(inputs.issue(procurement, { farmerId, itemId, quantity: 71 })).rejects.toThrow(/Only 70 kg/);
      await expect(inputs.issue(outsider, { farmerId, itemId, quantity: 1 })).rejects.toBeInstanceOf(NotFoundException);
      expect(await balance()).toBe(70);
    });

    it('locks after five wrong codes, then a new code unlocks it and the right one signs it', async () => {
      for (let i = 0; i < 5; i++) await expect(inputs.acknowledge(procurement, issueId, '000000')).rejects.toBeInstanceOf(BadRequestException);
      await expect(inputs.acknowledge(procurement, issueId, code)).rejects.toThrow(/Too many wrong codes/);
      await inputs.resend(procurement, issueId);
      const fresh = texts.filter((t) => t.to === '+255700111222').pop()!.text.match(/\b(\d{6})\b/)![1];
      const r: any = await inputs.acknowledge(procurement, issueId, fresh);
      expect(r.ackStatus).toBe('ACKNOWLEDGED');
      await expect(inputs.acknowledge(procurement, issueId, fresh)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('purchase orders and delivery receipts', () => {
    let supplierId: string; let itemId: string; let poId: string; let lineIds: string[];
    beforeAll(async () => {
      supplierId = (await prisma.supplier.create({ data: { mamcosId: mamcosA, name: `Agro Supplies ${tag}` } as any })).id;
      itemId = (await prisma.farmInputItem.create({ data: { mamcosId: mamcosA, name: `Seed ${tag}`, type: 'SEED' as any, unit: 'kg' } })).id;
    });

    it('drafts an order, which only a manager other than the writer approves', async () => {
      const po: any = await orders.create(procurement, { supplierId, lines: [{ itemName: 'Seed', inputItemId: itemId, unit: 'kg', quantity: 100, unitPrice: 1_500 }, { itemName: 'Gloves', unit: 'pair', quantity: 20, unitPrice: 3_000 }] });
      poId = po.id; lineIds = po.lines.map((l: any) => l.id);
      expect(po).toMatchObject({ status: 'DRAFT', totalAmount: 210_000 });
      expect(po.number).toMatch(/^PO-\d{4}-0001$/);
      await expect(orders.receive(procurement, poId, { lines: [{ lineId: lineIds[0], quantity: 1 }] })).rejects.toThrow(/Manager must approve/);
      await expect(orders.approve(procurement, poId)).rejects.toBeInstanceOf(ForbiddenException);
      expect(((await orders.approve(manager, poId)) as any).status).toBe('APPROVED');
      await expect(orders.approve(manager, poId)).rejects.toBeInstanceOf(ConflictException);
      await expect(orders.detail(outsider, poId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('receives in parts: stock in for inputs, a numbered delivery receipt each time, and no over-receiving', async () => {
      const a: any = await orders.receive(procurement, poId, { deliveryNote: 'DN-77', lines: [{ lineId: lineIds[0], quantity: 60 }] });
      expect(a.status).toBe('PARTIALLY_RECEIVED');
      expect(a.receipts[0].number).toMatch(/^DR-\d{4}-0001$/);
      expect((await prisma.farmInputMovement.aggregate({ where: { itemId }, _sum: { quantity: true } }))._sum.quantity).toBe(60);
      await expect(orders.receive(procurement, poId, { lines: [{ lineId: lineIds[0], quantity: 41 }] })).rejects.toThrow(/Only 40 kg/);
      await expect(orders.cancel(procurement, poId, 'changed my mind')).rejects.toThrow(/already been delivered/);
      const b: any = await orders.receive(procurement, poId, { lines: [{ lineId: lineIds[0], quantity: 40 }, { lineId: lineIds[1], quantity: 20 }] });
      expect(b.status).toBe('RECEIVED');
      expect(b.receipts).toHaveLength(2);
      expect((await prisma.farmInputMovement.aggregate({ where: { itemId }, _sum: { quantity: true } }))._sum.quantity).toBe(100);
    });

    it('cancels an order nothing has arrived for, with a reason', async () => {
      const po: any = await orders.create(procurement, { supplierId, lines: [{ itemName: 'Tarpaulin', unit: 'pc', quantity: 2, unitPrice: 50_000 }] });
      await expect(orders.cancel(procurement, po.id, '')).rejects.toBeInstanceOf(BadRequestException);
      expect(((await orders.cancel(procurement, po.id, 'No longer needed')) as any).status).toBe('CANCELLED');
    });
  });

  describe('maintenance schedules', () => {
    let canalId: string;
    beforeAll(async () => {
      const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, name: `M Scheme ${tag}` } });
      canalId = (await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: `M1-${tag}`, name: 'Canal 1' } })).id;
    });

    it('needs the thing it is about, then tracks overdue and due-soon', async () => {
      await expect(maint.create(procurement, { title: 'Desilt', target: 'CANAL', intervalDays: 90 } as any)).rejects.toThrow(/Choose the canal/);
      await maint.create(procurement, { title: 'Desilt main canal', target: 'CANAL', canalId, intervalDays: 90, nextDueOn: ymd(-5) } as any);
      await maint.create(procurement, { title: 'Grease gate 3', target: 'GATE', canalId, location: 'Gate 3', intervalDays: 30, nextDueOn: ymd(3) } as any);
      const l: any = await maint.list(procurement);
      expect(l.summary).toMatchObject({ overdue: 1, dueSoon: 1, total: 2 });
      expect(l.data.find((d: any) => d.title === 'Desilt main canal').state).toBe('OVERDUE');
    });

    it('moves the next date forward when the work is recorded, and keeps it in its own cooperative', async () => {
      const id = ((await maint.list(procurement)) as any).data.find((d: any) => d.title === 'Desilt main canal').id;
      await expect(maint.done(procurement, id, { doneOn: ymd(2) } as any)).rejects.toBeInstanceOf(BadRequestException);
      const done: any = await maint.done(procurement, id, { doneOn: ymd(0), note: 'Done with the excavator', cost: 250_000 } as any);
      expect(done.state).toBe('OK');
      expect(done.daysLeft).toBe(90);
      await expect(maint.done(outsider, id, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('compliance checklist', () => {
    it('reads the cooperative’s records: nothing held yet shows as missing, and it is private to the cooperative', async () => {
      const r: any = await compliance.report(manager);
      const byKey = Object.fromEntries(r.items.map((i: any) => [i.key, i]));
      expect(byKey.agm.status).toBe('MISSING');
      expect(byKey.officers.status).toBe('MISSING');
      expect(byKey.maintenance.status).toBe('OK');
      expect(r.summary.missing).toBeGreaterThanOrEqual(2);
      expect(((await compliance.report(outsider)) as any).items.find((i: any) => i.key === 'maintenance').status).toBe('OK');
    });
  });

  describe('loans tied to a plot', () => {
    it('allows a plot loan only for the member who holds that plot', async () => {
      const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, name: `L Scheme ${tag}` } });
      const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: `L1-${tag}`, name: 'Canal 1' } });
      const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: '1.1R', side: 'RIGHT', areaHectares: 5, hectareCount: 5 } });
      const hectare = await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: 1, code: `1:1R-1` } as any });
      const holder = await prisma.farmer.create({ data: { userId: await mkUser(mamcosA), controlNumber: `LH-${tag}`, firstName: 'Hold', lastName: 'Er', mamcosId: mamcosA } });
      const other = await prisma.farmer.create({ data: { userId: await mkUser(mamcosA), controlNumber: `LO-${tag}`, firstName: 'Oth', lastName: 'Er', mamcosId: mamcosA } });
      await prisma.irrigationHectareAllocation.create({ data: { hectareId: hectare.id, farmerId: holder.id, status: 'ACTIVE', allocatedOn: new Date('2026-01-01') } });
      const ownership = new OwnershipService(prisma as any);
      const loans = new LoansService(prisma as any, {} as any, {} as any, new AccountingService(prisma as any, ownership));
      const base = { lenderName: 'Bank', originalAmount: 1_000_000, amountOwed: 1_000_000 };
      await expect(loans.create({ ...base, farmerId: other.id, hectareId: hectare.id } as any)).rejects.toThrow(/does not hold that plot/);
      const loan: any = await loans.create({ ...base, farmerId: holder.id, hectareId: hectare.id } as any);
      expect(loan.hectareId).toBe(hectare.id);
    });
  });
});
