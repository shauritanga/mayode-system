import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { StaffService } from './staff.service';

const role = { id: 'role-1', name: 'Accountant', mamcosId: 'amcos-1', isActive: true, isSystem: false, permissions: [] };
const farmerRow = (user: any = {}) => ({
  firstName: 'Asha', lastName: 'Juma',
  user: { id: 'u1', phone: '+255700000001', role: UserRole.FARMER, roleId: null, isActive: true, firstName: null, lastName: null, language: 'sw', customRole: null, ...user },
});

function build(farmer: any, r: any = role) {
  const prisma: any = {
    farmer: { findFirst: jest.fn().mockResolvedValue(farmer) },
    role: { findUnique: jest.fn().mockResolvedValue(r) },
    user: { update: jest.fn().mockResolvedValue({}), findFirst: jest.fn() },
  };
  const sms: any = { sendTransactional: jest.fn().mockResolvedValue(true) };
  const ownership: any = { resolveTenantMamcosId: () => 'amcos-1' };
  const svc = new StaffService(prisma, ownership, {} as any, sms, { get: () => undefined } as any);
  const actor: any = { id: 'admin-1', role: UserRole.SUPER_ADMIN };
  return { svc, prisma, sms, actor };
}

describe('adding a registered farmer as staff', () => {
  it('gives the farmer login the staff role without touching the password and sends a notice', async () => {
    const { svc, prisma, sms, actor } = build(farmerRow());
    const res = await svc.create({ farmerId: 'f1', roleId: 'role-1', language: 'sw' } as any, actor);
    expect(res).toMatchObject({ id: 'u1', credentialsSms: 'sent', existingLogin: true });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ roleId: 'role-1', mamcosId: 'amcos-1', firstName: 'Asha', lastName: 'Juma' });
    expect(data).not.toHaveProperty('passwordHash');
    expect(data).not.toHaveProperty('role');
    expect(sms.sendTransactional.mock.calls[0][1]).toMatch(/^Ndugu Asha,/);
  });
  it('refuses a farmer who is not in this cooperative', async () => {
    const { svc, actor } = build(null);
    await expect(svc.create({ farmerId: 'f1', roleId: 'role-1' } as any, actor)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('refuses someone who is already staff', async () => {
    const { svc, actor } = build(farmerRow({ roleId: 'x', customRole: { name: 'Clerk', mamcosId: 'amcos-1' } }));
    await expect(svc.create({ farmerId: 'f1', roleId: 'role-1' } as any, actor)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuses a role from another cooperative, and a missing role', async () => {
    const other = build(farmerRow(), { ...role, mamcosId: 'amcos-2' });
    await expect(other.svc.create({ farmerId: 'f1', roleId: 'role-1' } as any, other.actor)).rejects.toBeInstanceOf(BadRequestException);
    const { svc, actor } = build(farmerRow());
    await expect(svc.create({ farmerId: 'f1' } as any, actor)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('removing access clears only the staff role', async () => {
    const { svc, prisma, actor } = build(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', customRole: { name: 'Accountant' } });
    await svc.removeAccess('u1', actor);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { roleId: null, mamcosId: null } });
  });
});
