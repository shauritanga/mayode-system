import { RolesService } from './roles.service';
import { UserRole } from '@prisma/client';

describe('Role creation', () => {
  it('creates an unprivileged role with no automatically copied grants', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'role-1' });
    const service = new RolesService({ role: { findUnique: jest.fn().mockResolvedValue(null), create } } as any);
    await service.create({ name: 'Operations' });
    expect(create).toHaveBeenCalledWith({ data: { name: 'Operations', description: undefined, systemRole: UserRole.CUSTOM } });
  });
  it('protects the Super Admin role from permission changes', async () => {
    const service = new RolesService({ role: { findUnique: jest.fn().mockResolvedValue({ isSystem: true }) } } as any);
    await expect(service.setPermissions('super', { permissions: [] })).rejects.toThrow('System roles');
  });
});
