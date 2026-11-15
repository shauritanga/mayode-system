/**
 * A hectare can be transferred to someone who is not yet a member: they are registered in the AMCOS and texted their
 * sign-in details. Runs against the throw-away `irrigation_test` schema. Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { FarmersService } from '../farmers/farmers.service';
import { IrrigationScopeService } from './irrigation-scope.service';
import { SchemesService } from './schemes.service';
import { DebtExposureService } from './debt-exposure.service';
import { StructureService } from './structure.service';
import { AllocationService } from './allocation.service';
import { TransferRecipientService } from './transfer-recipient.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Transfer to a new member (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: TransferRecipientService;
  const credentialTexts: { phone: string; firstName: string; password: string }[] = [];
  const phone = () => `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
  const MANAGER = {
    isActive: true, isSystem: false,
    permissions: [['irrigation', 'VIEW'], ['irrigation', 'EDIT'], ['irrigation_allocations', 'VIEW'], ['irrigation_allocations', 'CREATE'], ['irrigation_allocations', 'EDIT']]
      .map(([resource, action]) => ({ action, resource: { key: resource } })),
  };

  async function coop() {
    const tag = randomUUID().slice(0, 5);
    const mamcos = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcos.id, name: `Scheme ${tag}`, code: `T-${tag}`, maxHectaresPerFarmer: 1 } });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: 'C01', name: 'Canal 01' } });
    const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: `T-C01-B01-${tag}`, areaHectares: 30, hectareCount: 30 } });
    const hectare = await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: 1, code: `TH-${tag}` } });
    const staff = await prisma.user.create({ data: { phone: phone(), passwordHash: 'x', role: UserRole.CUSTOM, mamcosId: mamcos.id, firstName: 'Admin', lastName: 'Test' } });
    const actor = { id: staff.id, role: UserRole.CUSTOM, mamcosId: mamcos.id, customRole: MANAGER } as any;
    const holderUser = await prisma.user.create({ data: { phone: phone(), passwordHash: 'x', role: UserRole.FARMER } });
    const holder = await prisma.farmer.create({ data: { userId: holderUser.id, controlNumber: `H-${tag}`, firstName: 'Juma', lastName: 'Holder', mamcosId: mamcos.id } });
    await prisma.irrigationHectareAllocation.create({ data: { hectareId: hectare.id, farmerId: holder.id, status: 'ACTIVE', allocatedOn: new Date('2024-01-01'), requestedById: staff.id, approvedById: staff.id, approvedAt: new Date() } });
    return { mamcos, hectare, actor, holder, holderUser };
  }

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const own = new OwnershipService(prisma as any);
    const farmers = new FarmersService(prisma as any, { get: () => 'GD' } as any, {} as any, {} as any, {} as any, own, {} as any);
    const scope = new IrrigationScopeService(prisma as any);
    const schemes = new SchemesService(prisma as any, scope);
    const structure = new StructureService(prisma as any, scope, schemes, new DebtExposureService(prisma as any));
    const allocations = new AllocationService(prisma as any, scope, structure, { send: async () => undefined } as any, { create: async () => ({}) } as any);
    const credentials: any = { temporaryPassword: () => 'Temp1234', send: async (p: string, firstName: string, _l: string, password: string) => { credentialTexts.push({ phone: p, firstName, password }); return true; } };
    svc = new TransferRecipientService(prisma as any, farmers, credentials, allocations);
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('registers the new person as a member of the AMCOS, records the transfer to them and texts their sign-in details', async () => {
    const c = await coop();
    const p = phone();
    const res: any = await svc.createTransfer(c.actor, { hectareId: c.hectare.id, newFarmer: { firstName: 'Neema', lastName: 'Newman', phone: p }, reason: 'Sale of rights' } as any);
    const member = await prisma.farmer.findUniqueOrThrow({ where: { id: res.toFarmerId }, include: { user: true } });
    expect([member.firstName, member.lastName, member.mamcosId, member.user!.phone, member.user!.mustChangePassword]).toEqual(['Neema', 'Newman', c.mamcos.id, p, true]);
    expect(res.status).toMatch(/AWAITING_RECIPIENT|PENDING_APPROVAL/);
    expect(res.newMember).toMatchObject({ name: 'Neema Newman', credentialsSms: 'sent' });
    expect(credentialTexts.at(-1)).toEqual({ phone: p, firstName: 'Neema', password: 'Temp1234' });
  });

  it('refuses a number that already belongs to a member and tells you to choose them from the list', async () => {
    const c = await coop();
    const holderPhone = (await prisma.user.findUniqueOrThrow({ where: { id: c.holderUser.id } })).phone;
    await expect(svc.createTransfer(c.actor, { hectareId: c.hectare.id, newFarmer: { firstName: 'X', lastName: 'Y', phone: holderPhone }, reason: 'r' } as any)).rejects.toThrow(/already a member/);
  });

  it('leaves no new member behind when the transfer itself is refused, and sends no SMS', async () => {
    const c = await coop();
    const p = phone();
    const sent = credentialTexts.length;
    await svc.createTransfer(c.actor, { hectareId: c.hectare.id, newFarmer: { firstName: 'First', lastName: 'One', phone: phone() }, reason: 'r' } as any);
    // a second transfer on the same hectare is refused while the first is pending
    await expect(svc.createTransfer(c.actor, { hectareId: c.hectare.id, newFarmer: { firstName: 'Second', lastName: 'Two', phone: p }, reason: 'r' } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.user.count({ where: { phone: p } })).toBe(0);
    expect(credentialTexts.length).toBe(sent + 1);
  });

  it('needs either an existing member or a new one, never both or neither', async () => {
    const c = await coop();
    await expect(svc.createTransfer(c.actor, { hectareId: c.hectare.id, reason: 'r' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createTransfer(c.actor, { hectareId: c.hectare.id, toFarmerId: c.holder.id, newFarmer: { firstName: 'A', lastName: 'B', phone: phone() }, reason: 'r' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createTransfer(c.actor, { hectareId: c.hectare.id, newFarmer: { firstName: 'A', lastName: 'B', phone: '123' }, reason: 'r' } as any)).rejects.toThrow(/valid phone/);
  });
});
