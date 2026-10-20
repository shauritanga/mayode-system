import { AuthService } from './auth.service';

function setup(smsOk: boolean) {
  const user = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'u1', ...data })) };
  const role = { findFirst: jest.fn().mockResolvedValue({ id: 'r1', name: 'Cooperative Admin' }) };
  const prisma = {
    mamcos: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', name: 'Test AMCOS' }) },
    user,
    $transaction: jest.fn(async (fn) => fn({ user, role })),
  };
  const sms = { sendTransactional: jest.fn().mockResolvedValue(smsOk) };
  const config = { get: jest.fn((k: string) => (k === 'PORTAL_URL' ? 'https://portal.example' : undefined)) };
  const service = new AuthService(prisma as any, {} as any, config as any, sms as any);
  return { service, sms, user };
}

const dto = { firstName: 'Asha', lastName: 'Juma', phone: '0629593331', password: 'Temp1234', mamcosId: 'm1' };

describe('createCooperativeAdmin welcome SMS', () => {
  it('sends the sign-in details, hides the password in the log and forces a password change', async () => {
    const { service, sms, user } = setup(true);
    const res = await service.createCooperativeAdmin(dto as any);
    const [to, text, type, logged] = sms.sendTransactional.mock.calls[0];
    expect(to).toBe('+255629593331');
    expect(text).toContain('Temp1234');
    expect(text).toContain('msimamizi wa ushirika');
    expect(type).toBe('staff_credentials');
    expect(logged).not.toContain('Temp1234');
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mustChangePassword: true }) }));
    expect(res.credentialsSms).toBe('sent');
    expect(res).not.toHaveProperty('temporaryPassword');
  });

  it('returns the temporary password when the SMS fails', async () => {
    const { service } = setup(false);
    const res = await service.createCooperativeAdmin(dto as any);
    expect(res.credentialsSms).toBe('failed');
    expect(res.temporaryPassword).toBe('Temp1234');
  });
});
