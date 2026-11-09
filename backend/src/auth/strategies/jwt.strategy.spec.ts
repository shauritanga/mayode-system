import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

function strategy(user: any) {
  return new JwtStrategy({ get: () => 'test-secret' } as any, { user: { findUnique: jest.fn().mockResolvedValue(user) } } as any);
}
const req = (portal?: string) => ({ headers: portal ? { 'x-app-mode': portal } : {} });
const token = { sub: 'user-1', phone: '+255700000001', role: 'SUPER_ADMIN' };
describe('JWT role assignment is reloaded on every request', () => {
  it.each([UserRole.ADMIN, UserRole.CUSTOM])('denies unassigned %s, even with a stale Super Admin JWT', async (role) => {
    await expect(strategy({ id: 'user-1', isActive: true, role, customRole: null }).validate(req(), token)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('lets a farmer in without a role, and never promotes them from a stale Super Admin JWT', async () => {
    await expect(strategy({ id: 'user-1', isActive: true, role: UserRole.FARMER, customRole: null }).validate(req(), token))
      .resolves.toMatchObject({ role: UserRole.FARMER, customRole: null });
  });
  it('denies a role immediately after deactivation', async () => {
    await expect(strategy({ isActive: true, role: UserRole.CUSTOM, customRole: { isActive: false } }).validate(req(), token)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows the sole built-in role without a custom assignment', async () => {
    await expect(strategy({ id: 'user-1', isActive: true, role: UserRole.SUPER_ADMIN }).validate(req(), token)).resolves.toMatchObject({ role: UserRole.SUPER_ADMIN });
  });
  it('loads current custom-role grants rather than trusting token privileges', async () => {
    const customRole = { isActive: true, isSystem: false, permissions: [] };
    await expect(strategy({ id: 'user-1', isActive: true, role: UserRole.CUSTOM, customRole }).validate(req(), token)).resolves.toMatchObject({ role: UserRole.CUSTOM, customRole });
  });

  describe('a farmer who is also staff', () => {
    const staffRole = { name: 'Accountant', mamcosId: 'amcos-1', isActive: true, isSystem: false, permissions: [{ action: 'VIEW', resource: { key: 'users' } }] };
    const both = { id: 'user-1', isActive: true, role: UserRole.FARMER, roleId: 'r1', mamcosId: 'amcos-1', customRole: staffRole };
    it('acts as staff on the cooperatives portal', async () => {
      await expect(strategy(both).validate(req('cooperatives'), token)).resolves.toMatchObject({ role: UserRole.CUSTOM, customRole: staffRole, mamcosId: 'amcos-1' });
    });
    it.each(['farmers', undefined])('acts as an ordinary farmer on %s', async (portal) => {
      await expect(strategy(both).validate(req(portal), token)).resolves.toMatchObject({ role: UserRole.FARMER, roleId: null, customRole: null });
    });
    it('ignores an unknown portal value', async () => {
      await expect(strategy(both).validate(req('hacker'), token)).resolves.toMatchObject({ role: UserRole.FARMER, customRole: null });
    });
    it('never switches without a cooperative on the account', async () => {
      await expect(strategy({ ...both, mamcosId: null }).validate(req('cooperatives'), token)).resolves.toMatchObject({ role: UserRole.FARMER });
    });
    it('does not treat the legacy platform Farmer role as staff', async () => {
      const legacy = { name: 'Farmer', mamcosId: null, isActive: true, isSystem: false, permissions: [] };
      await expect(strategy({ ...both, customRole: legacy }).validate(req('cooperatives'), token)).resolves.toMatchObject({ role: UserRole.FARMER, customRole: legacy });
    });
  });
});
