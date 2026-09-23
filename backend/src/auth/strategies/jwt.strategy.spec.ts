import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

function strategy(user: any) {
  return new JwtStrategy({ get: () => 'test-secret' } as any, { user: { findUnique: jest.fn().mockResolvedValue(user) } } as any);
}
const token = { sub: 'user-1', phone: '+255700000001', role: 'SUPER_ADMIN' };
describe('JWT role assignment is reloaded on every request', () => {
  it.each([UserRole.ADMIN, UserRole.FARMER, UserRole.CUSTOM])('denies unassigned %s, even with a stale Super Admin JWT', async (role) => {
    await expect(strategy({ id: 'user-1', isActive: true, role, customRole: null }).validate(token)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('denies a role immediately after deactivation', async () => {
    await expect(strategy({ isActive: true, role: UserRole.CUSTOM, customRole: { isActive: false } }).validate(token)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows the sole built-in role without a custom assignment', async () => {
    await expect(strategy({ id: 'user-1', isActive: true, role: UserRole.SUPER_ADMIN }).validate(token)).resolves.toMatchObject({ role: UserRole.SUPER_ADMIN });
  });
  it('loads current custom-role grants rather than trusting token privileges', async () => {
    const customRole = { isActive: true, isSystem: false, permissions: [] };
    await expect(strategy({ id: 'user-1', isActive: true, role: UserRole.CUSTOM, customRole }).validate(token)).resolves.toMatchObject({ role: UserRole.CUSTOM, customRole });
  });
});
