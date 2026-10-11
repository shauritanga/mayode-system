/**
 * End-to-end check of the sale workflow against the LOCAL database, over HTTP with real
 * permission checks. Every row it creates is prefixed E2E<digits> and removed at the end.
 *
 *   npx ts-node scripts/e2e-sale-workflow.ts
 *
 * Needs the seeded Super Admin (+255748571660). Never run against production.
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SaleOrdersService } from '../src/sale-orders/sale-orders.service';
import { SettingsService } from '../src/settings/settings.service';
import { RiceProtocolsService } from '../src/rice-protocols/rice-protocols.service';

const TAG = 'E2E' + Date.now().toString().slice(-6);
let base = '';
let failures = 0;
const log = (ok: boolean, name: string, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data: any = null; try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}
const expect = (name: string, r: { status: number; data: any }, status: number | number[]) => {
  const ok = Array.isArray(status) ? status.includes(r.status) : r.status === status;
  log(ok, name, ok ? '' : `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 220)}`);
  return r.data;
};
const login = async (phone: string, password: string) => (await call('POST', '/auth/login', undefined, { phone, password })).data?.accessToken as string;

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost') + '/api/v1';
  const prisma = app.get(PrismaService);
  const settingsBefore = await app.get(SettingsService).getSalesSettings();
  const hadPlatformCalendar = !!(await prisma.riceProtocol.findFirst({ where: { mamcosId: null } }));

  try {
    const sa = await login('+255748571660', 'Mayode@2026');
    log(!!sa, 'Super Admin logs in');

    const mk = async (n: string, phone: string) => {
      const m = expect(`Create AMCOS ${n}`, await call('POST', '/mamcos', sa, { name: `Tst${n} ${TAG} Coop` }), [200, 201]);
      expect(`Create admin of ${n}`, await call('POST', '/auth/cooperative-admin', sa, { mamcosId: m.id, firstName: 'Admin', lastName: TAG, phone, password: 'Secret123!' }), [200, 201]);
      return { mamcosId: m.id as string, token: await login(phone, 'Secret123!') };
    };
    const A = await mk('A', '+25570' + TAG.slice(-6) + '1');
    const B = await mk('B', '+25570' + TAG.slice(-6) + '2');
    log(!!A.token && !!B.token, 'Cooperative admins log in');

    // The cooperative admin already has the ready-made roles.
    const roles = expect('Admin lists roles', await call('GET', '/roles', A.token), 200);
    const byName = (n: string) => roles.find((r: any) => r.name === n)?.id as string;
    log(['Salesperson', 'Warehouse Keeper', 'Sales Manager', 'Sales Auditor'].every((n) => !!byName(n)), 'Ready-made roles exist for a new cooperative');
    const staff = async (roleName: string, n: number) => {
      const phone = `+25571${TAG.slice(-6)}${n}`;
      const u = expect(`Create ${roleName}`, await call('POST', '/auth/staff', A.token, { firstName: roleName.split(' ')[0], lastName: TAG, phone, password: 'Secret123!', roleId: byName(roleName) }), [200, 201]);
      return { id: (u.id ?? u.user?.id) as string, token: await login(phone, 'Secret123!') };
    };
    const seller = await staff('Salesperson', 1), keeper = await staff('Warehouse Keeper', 2), mgr = await staff('Sales Manager', 3), auditor = await staff('Sales Auditor', 4);

    // Harvest source data (farmer/harvest modules are exercised elsewhere).
    const farmerUser = await prisma.user.create({ data: { phone: `+25572${TAG.slice(-6)}`, passwordHash: 'x', firstName: 'F', lastName: TAG, role: 'FARMER' } });
    const farmer = await prisma.farmer.create({ data: { userId: farmerUser.id, controlNumber: TAG + '-F', firstName: 'F', lastName: TAG, mamcosId: A.mamcosId } });
    const farm = await prisma.farm.create({ data: { farmCode: TAG + '-FARM', name: TAG, socialHectares: 1, mamcosId: A.mamcosId } });
    const cycle = await prisma.cropCycle.create({ data: { farmId: farm.id, farmerId: farmer.id, season: TAG } });
    const mkRec = (code: string, kg: number) => prisma.inventoryRecord.create({ data: { farmId: farm.id, farmerId: farmer.id, cropCycleId: cycle.id, weightKg: kg, trackingCode: `${TAG}-${code}`, receivedDate: new Date() } });
    const r1 = await mkRec('R1', 600), r2 = await mkRec('R2', 400);

    const wh = expect('Admin creates warehouse', await call('POST', '/warehouses', A.token, { name: `${TAG} Main store`, capacityKg: 5000 }), [200, 201]);
    expect('Salesperson cannot create a warehouse', await call('POST', '/warehouses', seller.token, { name: 'X' }), 403);
    expect('Assign keeper', await call('POST', `/warehouses/${wh.id}/keepers`, A.token, { userId: keeper.id }), [200, 201]);
    expect('Salesperson cannot receive stock', await call('POST', `/warehouses/${wh.id}/receive`, seller.token, { quantityKg: 5 }), 403);
    const rcv = expect('Keeper receives harvest', await call('POST', `/warehouses/${wh.id}/receive`, keeper.token, { inventoryRecordIds: [r1.id, r2.id] }), [200, 201]);
    log(rcv?.balance?.onHandKg === 1000, 'Stock on hand is 1000 kg', JSON.stringify(rcv?.balance));
    const listed = expect('Intake list loads', await call('GET', '/inventory/records', A.token), 200);
    const row = listed.find((x: any) => x.id === r1.id);
    log(row?.warehouse?.name === `${TAG} Main store` && row?.warehouseId === wh.id, 'Intake records show the warehouse they were received into');
    expect('Receiving the same records twice is refused', await call('POST', `/warehouses/${wh.id}/receive`, keeper.token, { inventoryRecordIds: [r1.id] }), 409);

    // Batching AFTER receiving must still give the lot its warehouse.
    const lot = expect('Create lot from received records', await call('POST', '/inventory/lots', A.token, { lotNumber: TAG + '-LOT', riceVariety: 'Super', inventoryRecordIds: [r1.id, r2.id] }), [200, 201]);
    const lotRow = await prisma.lot.findUnique({ where: { id: lot.id } });
    log(lotRow?.warehouseId === wh.id, 'Lot made after receiving belongs to that warehouse');
    const recs = await prisma.inventoryRecord.findMany({ where: { id: { in: [r1.id, r2.id] } }, select: { status: true } });
    log(recs.every((r) => r.status === 'BATCHED'), 'Received records stay BATCHED once in a lot');

    expect('Coop B cannot see coop A warehouse movements', await call('GET', `/warehouses/${wh.id}/movements`, B.token), 404);
    const bList = expect('Coop B warehouse list', await call('GET', '/warehouses', B.token), 200);
    log(bList.every((w: any) => w.id !== wh.id), 'Warehouses are tenant-scoped');

    const buyer = expect('Salesperson registers a buyer', await call('POST', '/buyers', seller.token, { name: `${TAG} Buyer` }), [200, 201]);
    const bBuyers = expect('Coop B buyers', await call('GET', '/buyers', B.token), 200);
    log(bBuyers.every((b: any) => b.id !== buyer.id), 'Buyers are tenant-scoped');

    // ---- Order 1: 1000 kg, buyer sends two trucks, pays by credit approval ----
    const dto = { buyerId: buyer.id, warehouseId: wh.id, lotId: lot.id, quantityKg: 400, pricePerKg: 2500, packaging: '8 × 50 kg bags' };
    const order = expect('Salesperson reserves 400 kg', await call('POST', '/sale-orders', seller.token, dto), [200, 201]);
    log(/^TST-\d{2}-\d{4}$/.test(order?.reference ?? ''), 'Short, readable reference issued', order?.reference);
    let w = (await call('GET', '/warehouses', A.token)).data.find((x: any) => x.id === wh.id);
    log(w.balance.reservedKg === 400 && w.balance.availableKg === 600, 'Reserved 400, available 600', JSON.stringify(w.balance));
    expect('Overselling is blocked', await call('POST', '/sale-orders', seller.token, { ...dto, quantityKg: 700 }), 409);
    expect('Keeper cannot create orders', await call('POST', '/sale-orders', keeper.token, dto), 403);
    expect('Coop B cannot open the order', await call('GET', `/sale-orders/${order.id}`, B.token), 404);
    expect('Salesperson cannot use the desk lookup', await call('GET', `/sale-orders/lookup/${order.reference}`, seller.token), 403);
    const looked = expect('Keeper looks up by reference (any case)', await call('GET', `/sale-orders/lookup/${order.reference.toLowerCase()}`, keeper.token), 200);
    log(looked?.buyer?.name === `${TAG} Buyer`, 'Lookup returns the buyer');
    expect('Cannot load before confirming', await call('POST', `/sale-orders/${order.id}/loads`, keeper.token, { vehiclePlate: 'T123ABC', driverName: 'Juma' }), 409);
    const conf = expect('Keeper confirms', await call('POST', `/sale-orders/${order.id}/confirm`, keeper.token, {}), [200, 201]);
    log(conf?.status === 'CONFIRMED' && !!conf?.sale?.invoiceNumber, 'CONFIRMED with invoice', conf?.sale?.invoiceNumber);
    expect('Confirming twice is refused', await call('POST', `/sale-orders/${order.id}/confirm`, keeper.token, {}), 409);
    expect('Confirmed order cannot be cancelled', await call('POST', `/sale-orders/${order.id}/cancel`, seller.token, { reason: 'nope nope' }), 409);

    const blocked = await call('POST', `/sale-orders/${order.id}/loads`, keeper.token, { vehiclePlate: 'T123ABC', driverName: 'Juma', weightKg: 200 });
    log(blocked.status === 409 && /Payment has not been received/.test(JSON.stringify(blocked.data)), 'Unpaid loading is refused with a clear message');
    expect('Keeper cannot approve credit', await call('POST', `/sale-orders/${order.id}/approve`, keeper.token, { kind: 'CREDIT', creditTermDays: 14, note: 'trusted buyer' }), 403);
    expect('Manager approves 14-day credit', await call('POST', `/sale-orders/${order.id}/approve`, mgr.token, { kind: 'CREDIT', creditTermDays: 14, note: 'trusted buyer' }), [200, 201]);

    // Truck 1: 205 kg weighed. Buyer collects, so it leaves at the gate.
    expect('Buyer-collect order refuses a hired truck', await call('POST', `/sale-orders/${order.id}/loads`, keeper.token, { vehiclePlate: 'T 100 AAA', driverName: 'Dan', mode: 'HIRED', transporterName: 'X', weightKg: 100 }), 400);
    const t1 = expect('Keeper loads truck 1 (205 kg weighed)', await call('POST', `/sale-orders/${order.id}/loads`, keeper.token, { weightKg: 205, bagCount: 4, vehiclePlate: 't 123 abc', driverName: 'Juma', driverPhone: '0712345678' }), [200, 201]);
    log(t1?.status === 'PARTIALLY_RELEASED' && t1?.loadedKg === 205 && t1?.remainingKg === 195, 'Part loaded: 205 of 400', `${t1?.status} ${t1?.loadedKg}/${t1?.remainingKg}`);
    log(t1?.loads?.[0]?.status === 'DELIVERED' && t1.loads[0].vehiclePlate === 'T 123 ABC', 'Own-truck load is delivered at the gate, plate normalised');
    w = (await call('GET', '/warehouses', A.token)).data.find((x: any) => x.id === wh.id);
    log(w.balance.onHandKg === 795 && w.balance.reservedKg === 195, 'Stock after truck 1: on hand 795, reserved 195', JSON.stringify(w.balance));
    expect('Cannot complete while part loaded', await call('POST', `/sale-orders/${order.id}/complete`, keeper.token), 409);
    expect('Far-too-big load is refused', await call('POST', `/sale-orders/${order.id}/loads`, keeper.token, { weightKg: 500, vehiclePlate: 'T 900 AAA', driverName: 'Dan' }), 400);

    // Truck 2: 192 kg — 397 of 400 (within 2%), closes the order and frees the 3 kg shortfall.
    const t2 = expect('Keeper loads truck 2 (192 kg)', await call('POST', `/sale-orders/${order.id}/loads`, keeper.token, { weightKg: 192, vehiclePlate: 'T 456 DEF', driverName: 'Asha' }), [200, 201]);
    log(t2?.status === 'RELEASED' && t2?.loads?.length === 2, 'Order fully loaded after truck 2', t2?.status);
    w = (await call('GET', '/warehouses', A.token)).data.find((x: any) => x.id === wh.id);
    log(w.balance.onHandKg === 603 && w.balance.reservedKg === 0 && w.balance.availableKg === 603, 'Ledger balances: on hand 603, nothing stuck reserved', JSON.stringify(w.balance));
    expect('No more trucks once fully loaded', await call('POST', `/sale-orders/${order.id}/loads`, keeper.token, { weightKg: 5, vehiclePlate: 'T 700 AAA', driverName: 'Dan' }), 409);
    const unpaid = await call('POST', `/sale-orders/${order.id}/complete`, keeper.token);
    log(unpaid.status === 400 && /Payment has not been settled/.test(JSON.stringify(unpaid.data)), 'Cannot complete while payment is outstanding');
    expect('Finance settles the sale', await call('POST', `/sales/${conf.sale.id}/settle`, sa, {}), [200, 201]);
    const done = expect('Keeper completes the order', await call('POST', `/sale-orders/${order.id}/complete`, keeper.token), [200, 201]);
    log(done?.status === 'COMPLETED', 'Order COMPLETED');

    const events = (await call('GET', `/sale-orders/${order.id}`, A.token)).data?.events ?? [];
    const types = events.map((e: any) => e.type);
    log(['order.reserved', 'order.confirmed', 'order.credit_approved', 'order.truck_loaded', 'order.completed'].every((t) => types.includes(t)) && types.filter((t: string) => t === 'order.truck_loaded').length === 2, 'Timeline records both trucks and every step', types.join(', '));
    log(events.every((e: any) => !!e.actorName && !!e.createdAt), 'Every event names the actor and time');
    log(events.find((e: any) => e.type === 'order.credit_approved')?.actorName?.startsWith('Sales'), 'Credit approval attributed to the manager');

    // ---- Order 2: company delivers with a hired truck; cancel path ----
    const o2 = expect('Second order, we deliver', await call('POST', '/sale-orders', seller.token, { ...dto, quantityKg: 300, needsTransport: true }), [200, 201]);
    expect('Seller cancels an unconfirmed order', await call('POST', `/sale-orders/${o2.id}/cancel`, seller.token, { reason: 'buyer withdrew' }), [200, 201]);
    w = (await call('GET', '/warehouses', A.token)).data.find((x: any) => x.id === wh.id);
    log(w.balance.reservedKg === 0 && w.balance.availableKg === 603, 'Cancelling returns the reserved stock', JSON.stringify(w.balance));
    const o3 = expect('Third order, we deliver', await call('POST', '/sale-orders', seller.token, { ...dto, quantityKg: 300, needsTransport: true }), [200, 201]);
    expect('Keeper confirms order 3', await call('POST', `/sale-orders/${o3.id}/confirm`, keeper.token, {}), [200, 201]);
    expect('Manager allows unpaid loading once', await call('POST', `/sale-orders/${o3.id}/approve`, mgr.token, { kind: 'RELEASE', note: 'verbal agreement' }), [200, 201]);
    expect('We-deliver order refuses a buyer-pickup truck', await call('POST', `/sale-orders/${o3.id}/loads`, keeper.token, { mode: 'BUYER_PICKUP', vehiclePlate: 'T 100 AAA', driverName: 'Dan' }), 400);
    expect('Hired truck needs a transporter name', await call('POST', `/sale-orders/${o3.id}/loads`, keeper.token, { mode: 'HIRED', vehiclePlate: 'T 100 AAA', driverName: 'Dan' }), 400);
    const h = expect('Keeper loads a hired truck', await call('POST', `/sale-orders/${o3.id}/loads`, keeper.token, { mode: 'HIRED', transporterName: 'FastHaul', fee: 50000, destination: 'Dar es Salaam', vehiclePlate: 'T 777 XYZ', driverName: 'Baraka' }), [200, 201]);
    const load = h?.loads?.[0];
    log(load?.status === 'ASSIGNED' && h?.status === 'RELEASED', 'Hired truck is assigned; order fully loaded');
    expect('Truck leaves the gate', await call('POST', `/sale-orders/${o3.id}/loads/${load.id}/status`, keeper.token, { status: 'IN_TRANSIT' }), [200, 201]);
    expect('Delivery needs a receiver', await call('POST', `/sale-orders/${o3.id}/loads/${load.id}/status`, keeper.token, { status: 'DELIVERED' }), 400);
    expect('Delivered with receiver', await call('POST', `/sale-orders/${o3.id}/loads/${load.id}/status`, keeper.token, { status: 'DELIVERED', receivedBy: 'Buyer rep' }), [200, 201]);
    expect('Delivered load cannot change again', await call('POST', `/sale-orders/${o3.id}/loads/${load.id}/status`, keeper.token, { status: 'DELIVERED', receivedBy: 'X' }), 409);

    // ---- Order 4: buyer takes only part; manager closes it short ----
    const o4 = expect('Order 4 reserves the rest of the lot (300 kg)', await call('POST', '/sale-orders', seller.token, { ...dto, quantityKg: 300 }), [200, 201]);
    const c4 = expect('Keeper confirms order 4', await call('POST', `/sale-orders/${o4.id}/confirm`, keeper.token, {}), [200, 201]);
    expect('Manager approves credit for order 4', await call('POST', `/sale-orders/${o4.id}/approve`, mgr.token, { kind: 'CREDIT', creditTermDays: 7, note: 'repeat buyer' }), [200, 201]);
    expect('Close short needs a part-loaded order', await call('POST', `/sale-orders/${o4.id}/close-short`, mgr.token, { reason: 'buyer left' }), 409);
    expect('Keeper loads only 100 kg', await call('POST', `/sale-orders/${o4.id}/loads`, keeper.token, { weightKg: 100, vehiclePlate: 'T 111 AAA', driverName: 'Neema' }), [200, 201]);
    expect('Keeper cannot close short', await call('POST', `/sale-orders/${o4.id}/close-short`, keeper.token, { reason: 'buyer left' }), 403);
    const closed = expect('Manager closes order 4 short', await call('POST', `/sale-orders/${o4.id}/close-short`, mgr.token, { reason: 'buyer cannot collect the rest' }), [200, 201]);
    log(closed?.status === 'RELEASED' && closed?.quantityKg === 100, 'Order closed at the 100 kg loaded', `${closed?.status} ${closed?.quantityKg}`);
    const sale4 = await prisma.sale.findUnique({ where: { id: c4.sale.id }, include: { payments: true, invoice: true } });
    log(sale4?.quantityKg === 100 && sale4.totalRevenue === 250000, 'Sale shrank to 100 kg / TZS 250,000', `${sale4?.quantityKg} / ${sale4?.totalRevenue}`);
    log(Math.round(sale4!.payments.reduce((n, p) => n + p.amount, 0)) === 250000, 'Farmer payouts reduced to match', String(sale4?.payments.reduce((n, p) => n + p.amount, 0)));
    log(sale4?.invoice?.amount === 250000, 'Invoice reduced to match', String(sale4?.invoice?.amount));
    const adj = await prisma.ledgerEntry.count({ where: { sourceType: { in: ['SaleAdjustment', 'SaleAdjustmentPayables'] }, sourceId: c4.sale.id } });
    log(adj >= 3, 'Ledger adjustment posted', `${adj} entries`);
    w = (await call('GET', '/warehouses', A.token)).data.find((x: any) => x.id === wh.id);
    log(w.balance.reservedKg === 0, 'Nothing left reserved after closing short', JSON.stringify(w.balance));
    const re = expect('The 200 kg given back can be sold again', await call('POST', '/sale-orders', seller.token, { ...dto, quantityKg: 200 }), [200, 201]);
    expect('Seller cancels it', await call('POST', `/sale-orders/${re.id}/cancel`, seller.token, { reason: 'test only' }), [200, 201]);

    // Closing short after the buyer has paid is refused (finance must refund).
    const o5 = expect('Order 5 (150 kg)', await call('POST', '/sale-orders', seller.token, { ...dto, quantityKg: 150 }), [200, 201]);
    const c5 = expect('Confirm order 5', await call('POST', `/sale-orders/${o5.id}/confirm`, keeper.token, {}), [200, 201]);
    expect('Settle order 5 sale', await call('POST', `/sales/${c5.sale.id}/settle`, sa, {}), [200, 201]);
    expect('Load 50 kg of order 5', await call('POST', `/sale-orders/${o5.id}/loads`, keeper.token, { weightKg: 50, vehiclePlate: 'T 222 BBB', driverName: 'Omari' }), [200, 201]);
    const refused = await call('POST', `/sale-orders/${o5.id}/close-short`, mgr.token, { reason: 'buyer left' });
    log(refused.status === 409 && /already been settled/.test(JSON.stringify(refused.data)), 'Close short refused once payment is settled');

    // ---- Settings drive the rules ----
    expect('Keeper cannot change settings', await call('PUT', '/settings/sales', keeper.token, { loadTolerancePct: 9, reservationExpiryDays: 1 }), 403);
    expect('Tolerance above 10% is rejected', await call('PUT', '/settings/sales', sa, { loadTolerancePct: 50, reservationExpiryDays: 1 }), 400);
    expect('Super Admin saves rules', await call('PUT', '/settings/sales', sa, { loadTolerancePct: 5, reservationExpiryDays: 1 }), [200, 201]);
    const got = expect('Rules read back', await call('GET', '/settings/sales', sa), 200);
    log(got.loadTolerancePct === 5 && got.reservationExpiryDays === 1, 'Settings persisted', JSON.stringify(got));
    const o6 = expect('Order 6 for expiry', await call('POST', '/sale-orders', seller.token, { ...dto, quantityKg: 20 }), [200, 201]);
    const beforeExpiry = (await call('GET', `/sale-orders/${o6.id}`, seller.token)).data;
    log(!!beforeExpiry.expiresAt, 'Reserved order shows when it will expire');
    await prisma.saleOrder.update({ where: { id: o6.id }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    const expired = await app.get(SaleOrdersService).expireStale();
    log(expired >= 1, 'Stale reservation expired by the sweep', `${expired}`);
    const after6 = (await call('GET', `/sale-orders/${o6.id}`, seller.token)).data;
    log(after6.status === 'CANCELLED' && after6.events.some((e: any) => e.type === 'order.expired' && !e.actorUserId), 'Expired order is cancelled and logged as system');
    expect('A confirmed order (5) cannot be cancelled', await call('POST', `/sale-orders/${o5.id}/cancel`, seller.token, { reason: 'late try' }), 409);

    expect('Lot cannot be oversold (ask 700)', await call('POST', '/sale-orders', seller.token, { ...dto, quantityKg: 700 }), 409);

    // ---- Counted stock becomes sellable through a lot (the owner's own rice) ----
    const wh2 = expect('Second warehouse for counted stock', await call('POST', '/warehouses', A.token, { name: `${TAG} Counted store` }), [200, 201]);
    expect('Count 500 kg in', await call('POST', `/warehouses/${wh2.id}/receive`, A.token, { quantityKg: 500, note: 'opening count' }), [200, 201]);
    let w2 = (await call('GET', '/warehouses', A.token)).data.find((x: any) => x.id === wh2.id);
    log(w2.unlottedKg === 500 && w2.balance.onHandKg === 500, 'Counted stock shows as not in a lot', `${w2.unlottedKg}`);
    expect('Counted stock has no lot to sell yet', (await call('GET', `/sale-orders/lots?warehouseId=${wh2.id}`, A.token)).data.length === 0 ? { status: 200, data: {} } : { status: 500, data: 'unexpected lots' }, 200);
    expect('Salesperson cannot make a lot', await call('POST', `/warehouses/${wh2.id}/lots`, seller.token, { lotNumber: TAG + '-C1', quantityKg: 300 }), 403);
    expect('Cannot lot more than is counted', await call('POST', `/warehouses/${wh2.id}/lots`, A.token, { lotNumber: TAG + '-C1', quantityKg: 600 }), 400);
    expect('Admin makes a 300 kg lot', await call('POST', `/warehouses/${wh2.id}/lots`, A.token, { lotNumber: TAG + '-C1', riceVariety: 'Super', quantityKg: 300 }), [200, 201]);
    expect('Lot numbers are unique', await call('POST', `/warehouses/${wh2.id}/lots`, A.token, { lotNumber: TAG + '-C1', quantityKg: 100 }), 409);
    expect('Only 200 kg is left to lot', await call('POST', `/warehouses/${wh2.id}/lots`, A.token, { lotNumber: TAG + '-C2', quantityKg: 250 }), 400);
    w2 = (await call('GET', '/warehouses', A.token)).data.find((x: any) => x.id === wh2.id);
    log(w2.unlottedKg === 200, 'Unlotted stock drops to 200', `${w2.unlottedKg}`);
    const lots2 = expect('Sellable lots list', await call('GET', `/sale-orders/lots?warehouseId=${wh2.id}`, seller.token), 200);
    log(lots2.length === 1 && lots2[0].remainingKg === 300, 'Order form sees the lot with 300 kg left', JSON.stringify(lots2.map((l: any) => l.remainingKg)));
    const co = expect('Reserve 120 kg of counted stock', await call('POST', '/sale-orders', seller.token, { buyerId: buyer.id, warehouseId: wh2.id, lotId: lots2[0].id, quantityKg: 120, pricePerKg: 2000 }), [200, 201]);
    const lots2b = (await call('GET', `/sale-orders/lots?warehouseId=${wh2.id}`, seller.token)).data;
    log(lots2b[0].remainingKg === 180, 'Lot shows 180 kg left after the reservation', JSON.stringify(lots2b.map((l: any) => l.remainingKg)));
    const cc = expect('Keeper-level confirm of own-stock order', await call('POST', `/sale-orders/${co.id}/confirm`, A.token, {}), [200, 201]);
    log(!!cc?.sale?.invoiceNumber, 'Own-stock order gets an invoice', cc?.sale?.invoiceNumber);
    const ownSale = await prisma.sale.findUnique({ where: { id: cc.sale.id }, include: { apportionments: true, payments: true } });
    log(ownSale?.apportionments.length === 0 && ownSale?.payments.length === 0 && ownSale?.totalRevenue === 240000, 'No farmer payouts for the owner\'s own rice, revenue TZS 240,000');
    expect('Approve credit for own-stock order', await call('POST', `/sale-orders/${co.id}/approve`, mgr.token, { kind: 'CREDIT', creditTermDays: 7, note: 'own stock sale' }), [200, 201]);
    expect('Load 80 kg', await call('POST', `/sale-orders/${co.id}/loads`, A.token, { weightKg: 80, vehiclePlate: 'T 555 CCC', driverName: 'Zawadi' }), [200, 201]);
    const cs = expect('Close own-stock order short', await call('POST', `/sale-orders/${co.id}/close-short`, mgr.token, { reason: 'buyer took less' }), [200, 201]);
    const ownSale2 = await prisma.sale.findUnique({ where: { id: cc.sale.id } });
    log(cs?.status === 'RELEASED' && ownSale2?.quantityKg === 80 && ownSale2.totalRevenue === 160000, 'Own-stock sale shrinks to 80 kg / TZS 160,000');
    const reg = expect('Sales register', await call('GET', '/sales', A.token), 200);
    log(reg.some((x: any) => x.saleOrder?.reference === co.reference), 'Sales register shows each sale\'s order reference', co.reference);
    w2 = (await call('GET', '/warehouses', A.token)).data.find((x: any) => x.id === wh2.id);
    log(w2.balance.onHandKg === 420 && w2.balance.reservedKg === 0, 'Counted warehouse ledger balances: 420 on hand, none reserved', JSON.stringify(w2.balance));
    log(w2.unlottedKg === 200, 'Unlotted stock still 200 after selling from the lot', `${w2.unlottedKg}`);

    // ---- Rice calendar: platform calendar drives farmers; a cooperative's own does not ----
    expect('Keeper (calendar viewer) can read the platform calendar', await call('GET', '/rice-protocols/platform/active', keeper.token), 200);
    const plat = expect('Super Admin creates the platform calendar', await call('POST', '/rice-protocols/platform/bootstrap', sa), [200, 201]);
    log(plat.mamcosId === null && plat.isActive, 'Platform calendar has no cooperative');
    expect('Cooperative admin cannot create a platform calendar', await call('POST', '/rice-protocols/platform/bootstrap', A.token), 403);
    expect('Cooperative admin cannot edit the platform calendar', await call('PATCH', `/rice-protocols/${plat.id}`, A.token, { name: 'x', taskDefinitions: plat.taskDefinitions }), 403);
    const coopCal = expect('Cooperative admin creates its own calendar', await call('POST', `/rice-protocols/mamcos/${A.mamcosId}/bootstrap`, A.token), [200, 201]);
    log(coopCal.mamcosId === A.mamcosId, 'Own calendar belongs to the cooperative');
    expect('Coop B cannot read coop A calendars', await call('GET', `/rice-protocols/mamcos/${A.mamcosId}`, B.token), 404);
    expect('Coop B cannot edit coop A calendar', await call('PATCH', `/rice-protocols/${coopCal.id}`, B.token, { name: 'x', taskDefinitions: coopCal.taskDefinitions }), 404);
    const withExtra = [...coopCal.taskDefinitions, { key: 'coop_only_meeting', title: 'Coop meeting', guidance: 'Members meet', daysFromPlanting: 25 }];
    expect('Cannot drop the harvest-check tasks', await call('PATCH', `/rice-protocols/${coopCal.id}`, A.token, { name: 'Ours', taskDefinitions: coopCal.taskDefinitions.filter((t: any) => t.key !== 'bagging') }), 400);
    const coopV2 = expect('Cooperative saves its own calendar with a coop-only task', await call('PATCH', `/rice-protocols/${coopCal.id}`, A.token, { name: 'Ours', taskDefinitions: withExtra }), 200);
    log(coopV2.version === 2, 'Cooperative calendar is version 2 on its own numbering', String(coopV2.version));
    const platAfter = (await call('GET', '/rice-protocols/platform/active', sa)).data;
    log(platAfter.version === 1 && !platAfter.tasks.some((t: any) => t.key === 'coop_only_meeting'), 'Platform calendar is untouched by the cooperative');
    const newCycle = await prisma.cropCycle.create({ data: { farmId: farm.id, farmerId: farmer.id, season: TAG, plantingDate: new Date(Date.now() - 20 * 86_400_000), expectedHarvest: new Date(Date.now() + 90 * 86_400_000) } });
    await app.get(RiceProtocolsService).scheduleForCycle(newCycle.id);
    const cycleTasks = await prisma.riceCalendarTask.findMany({ where: { cropCycleId: newCycle.id } });
    log(cycleTasks.length === plat.taskDefinitions.length && cycleTasks.every((t) => t.protocolVersion === 1), 'A farm in the cooperative gets the PLATFORM schedule', `${cycleTasks.length} tasks`);
    log(!cycleTasks.some((t) => t.taskKey === 'coop_only_meeting'), 'The cooperative-only task never reaches a farmer cycle (so never the mobile app)');
    const up = expect('Cooperative sees its own calendar laid over members', await call('GET', `/rice-protocols/mamcos/${A.mamcosId}/upcoming`, A.token), 200);
    log(up.some((r: any) => r.taskKey === 'coop_only_meeting'), 'Upcoming list includes the cooperative-only task');
    const bigPlat = [...plat.taskDefinitions, { key: 'platform_new_step', title: 'New platform step', guidance: 'Added by Super Admin', daysFromPlanting: 12 }];
    const platV2 = expect('Super Admin edits the platform calendar', await call('PATCH', `/rice-protocols/${plat.id}`, sa, { name: plat.name, taskDefinitions: bigPlat }), 200);
    log(platV2.version === 2 && platV2.mamcosId === null, 'Platform calendar is now version 2');
    const later = await prisma.cropCycle.create({ data: { farmId: farm.id, farmerId: farmer.id, season: TAG + 'b', plantingDate: new Date(), expectedHarvest: new Date(Date.now() + 100 * 86_400_000) } });
    await app.get(RiceProtocolsService).scheduleForCycle(later.id);
    const laterTasks = await prisma.riceCalendarTask.findMany({ where: { cropCycleId: later.id } });
    log(laterTasks.some((t) => t.taskKey === 'platform_new_step' && t.protocolVersion === 2), 'New cycles pick up the new platform version');

    // Super Admin boundaries and audit scope
    expect('Super Admin cannot create cooperative staff', await call('POST', '/auth/staff', sa, { firstName: 'X', lastName: 'Y', phone: `+25573${TAG.slice(-6)}`, password: 'Secret123!', roleId: byName('Salesperson') }), 400);
    expect('Super Admin cannot create a role inside a coop', await call('POST', '/roles', sa, { name: TAG + ' Bad', mamcosId: A.mamcosId }), 400);
    const aud = expect('Manager reads the audit log', await call('GET', '/audit-logs?take=50', mgr.token), 200);
    log(aud.length > 0 && aud.every((a: any) => a.mamcosId === A.mamcosId), 'Audit log shows only own cooperative', `${aud.length} rows`);
    expect('Salesperson cannot read the audit log', await call('GET', '/audit-logs', seller.token), 403);
    expect('Auditor can read the audit log', await call('GET', '/audit-logs', auditor.token), 200);
    expect('Auditor cannot create an order', await call('POST', '/sale-orders', auditor.token, dto), 403);
    const bAud = expect('Coop B audit log', await call('GET', '/audit-logs?take=200', B.token), 200);
    log(bAud.every((a: any) => a.mamcosId === B.mamcosId), "Coop B sees only its own audit entries");
  } finally {
    await app.get(SettingsService).updateSalesSettings(settingsBefore);
    const mam = await prisma.mamcos.findMany({ where: { name: { contains: TAG } }, select: { id: true } });
    const mids = mam.map((m) => m.id);
    const orders = await prisma.saleOrder.findMany({ where: { mamcosId: { in: mids } }, select: { id: true, saleId: true } });
    const saleIds = orders.map((o) => o.saleId).filter(Boolean) as string[];
    const invoices = await prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { invoiceNumber: true } });
    await prisma.auditLog.deleteMany({ where: { mamcosId: { in: mids } } });
    await prisma.saleOrder.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.stockMovement.deleteMany({ where: { warehouse: { mamcosId: { in: mids } } } });
    for (const t of ['dispatch', 'invoice', 'premiumFundEntry', 'saleApportionment', 'payment', 'revenue'] as const) {
      try { await (prisma as any)[t].deleteMany({ where: { saleId: { in: saleIds } } }); } catch { /* no such column */ }
    }
    if (invoices.length) {
      await prisma.$executeRawUnsafe(`DELETE FROM ledger_entries WHERE ${invoices.map((i) => `description LIKE '%${i.invoiceNumber}%'`).join(' OR ')}`);
    }
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.warehouseKeeper.deleteMany({ where: { warehouse: { mamcosId: { in: mids } } } });
    await prisma.inventoryRecord.deleteMany({ where: { trackingCode: { startsWith: TAG } } });
    await prisma.lot.deleteMany({ where: { lotNumber: { startsWith: TAG } } });
    await prisma.warehouse.deleteMany({ where: { mamcosId: { in: mids } } });
    await prisma.buyer.deleteMany({ where: { mamcosId: { in: mids } } });
    await prisma.cropCycle.deleteMany({ where: { season: { startsWith: TAG } } });
    if (!hadPlatformCalendar) await prisma.riceProtocol.deleteMany({ where: { mamcosId: null } });
    await prisma.farm.deleteMany({ where: { farmCode: { startsWith: TAG } } });
    await prisma.farmer.deleteMany({ where: { controlNumber: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { OR: [{ mamcosId: { in: mids } }, { lastName: TAG }] } });
    await prisma.role.deleteMany({ where: { OR: [{ mamcosId: { in: mids } }, { name: { startsWith: TAG } }] } });
    await prisma.mamcos.deleteMany({ where: { id: { in: mids } } });
    await prisma.referenceCounter.deleteMany({ where: { key: { startsWith: 'TST-' } } });
    await app.close();
  }
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('E2E crashed:', e); process.exit(2); });
