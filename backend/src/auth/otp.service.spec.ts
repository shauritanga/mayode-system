import { JwtService } from '@nestjs/jwt';
import { OtpService, OTP_MAX_ATTEMPTS } from './otp.service';

function build(opts: { sms?: boolean; user?: unknown; echo?: boolean; account?: boolean } = {}) {
  const rows: any[] = [];
  const prisma = {
    user: { findUnique: jest.fn(async () => (opts.account ? { id: 'u1' } : null)) },
    otpCode: {
      findMany: jest.fn(async ({ where }: any) => rows.filter((r) => r.phone === where.phone).sort((a, b) => b.createdAt - a.createdAt)),
      create: jest.fn(async ({ data }: any) => { const r = { id: `o${rows.length}`, attempts: 0, consumedAt: null, createdAt: new Date(), ...data }; rows.push(r); return r; }),
      delete: jest.fn(async ({ where }: any) => { rows.splice(rows.findIndex((r) => r.id === where.id), 1); }),
      findFirst: jest.fn(async ({ where }: any) => rows.filter((r) => r.phone === where.phone && !r.consumedAt && r.expiresAt > new Date()).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null),
      update: jest.fn(async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id); r.attempts += data.attempts.increment; return r; }),
      updateMany: jest.fn(async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id && !x.consumedAt); if (r) r.consumedAt = data.consumedAt; return { count: r ? 1 : 0 }; }),
      deleteMany: jest.fn(),
    },
  };
  const sms = { sendTransactional: jest.fn().mockResolvedValue(opts.sms ?? true), isConfigured: jest.fn().mockReturnValue(false) };
  const jwt = new JwtService({ secret: 's' });
  const config = { get: (k: string) => (k === 'OTP_DEV_ECHO' ? String(!!opts.echo) : undefined) };
  const auth = {
    loginVerifiedPhone: jest.fn().mockResolvedValue(opts.user ?? null),
    registerVerifiedFarmer: jest.fn().mockResolvedValue({ accessToken: 'a' }),
  };
  const svc = new OtpService(prisma as never, sms as never, jwt, config as never, auth as never);
  return { svc, prisma, sms, auth, rows, jwt };
}
const codeFromSms = (sms: any) => /is (\d{6})\./.exec(sms.sendTransactional.mock.calls.at(-1)[1])![1];

describe('OtpService', () => {
  it('refuses to log in a number with no account, without sending a code', async () => {
    const { svc, sms } = build({ account: false });
    await expect(svc.request('0768680433', undefined, 'login')).rejects.toMatchObject({
      status: 404,
      response: { code: 'PHONE_NOT_REGISTERED' },
    });
    expect(sms.sendTransactional).not.toHaveBeenCalled();
  });

  it('refuses to register a number that already has an account, without sending a code', async () => {
    const { svc, sms } = build({ account: true });
    await expect(svc.request('0768680433', undefined, 'register')).rejects.toMatchObject({
      status: 409,
      response: { code: 'PHONE_ALREADY_REGISTERED' },
    });
    expect(sms.sendTransactional).not.toHaveBeenCalled();
  });

  it('sends a code when the number fits the chosen path', async () => {
    const login = build({ account: true });
    await login.svc.request('0768680433', undefined, 'login');
    expect(login.sms.sendTransactional).toHaveBeenCalledTimes(1);
    const reg = build({ account: false });
    await reg.svc.request('0768680433', undefined, 'register');
    expect(reg.sms.sendTransactional).toHaveBeenCalledTimes(1);
  });

  it('keeps the combined flow for older app versions that send no intent', async () => {
    const { svc, sms, prisma } = build({ account: false });
    await svc.request('0768680433');
    expect(sms.sendTransactional).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('texts a code, stores only its hash, never logs it', async () => {
    const { svc, sms, rows } = build();
    const r = await svc.request('0768680433');
    const code = codeFromSms(sms);
    expect(sms.sendTransactional.mock.calls[0][0]).toBe('+255768680433');
    expect(sms.sendTransactional.mock.calls[0][3]).not.toContain(code);
    expect(JSON.stringify(rows)).not.toContain(code);
    expect(r.devCode).toBeUndefined();
  });

  it('echoes the code only with OTP_DEV_ECHO and simulated SMS', async () => {
    const { svc, sms } = build({ echo: true });
    const r = await svc.request('0768680433');
    expect(r.devCode).toBe(codeFromSms(sms));
  });

  it('enforces the resend cooldown and the hourly cap', async () => {
    const { svc, rows } = build();
    await svc.request('0768680433');
    await expect(svc.request('0768680433')).rejects.toMatchObject({ status: 429 });
    rows.forEach((r) => (r.createdAt = new Date(Date.now() - 120_000)));
    for (let i = 0; i < 4; i++) { await svc.request('0768680433'); rows.forEach((r) => (r.createdAt = new Date(Date.now() - 120_000))); }
    await expect(svc.request('0768680433')).rejects.toMatchObject({ status: 429 });
  });

  it('removes the code and reports an error when the SMS provider fails', async () => {
    const { svc, rows } = build({ sms: false });
    await expect(svc.request('0768680433')).rejects.toMatchObject({ status: 503 });
    expect(rows).toHaveLength(0);
  });

  it('signs in an existing user and consumes the code once', async () => {
    const { svc, sms, auth } = build({ user: { accessToken: 'tok' } });
    await svc.request('0768680433');
    const code = codeFromSms(sms);
    expect(await svc.verify('0768680433', code)).toMatchObject({ needsRegistration: false, accessToken: 'tok' });
    expect(auth.loginVerifiedPhone).toHaveBeenCalledWith('+255768680433');
    await expect(svc.verify('0768680433', code)).rejects.toMatchObject({ status: 401 });
  });

  it('locks a code after too many wrong attempts, even with the right code', async () => {
    const { svc, sms } = build({ user: { accessToken: 'tok' } });
    await svc.request('0768680433');
    const code = codeFromSms(sms);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await expect(svc.verify('0768680433', wrong)).rejects.toMatchObject({ status: 401 });
    await expect(svc.verify('0768680433', code)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an expired code', async () => {
    const { svc, sms, rows } = build();
    await svc.request('0768680433');
    const code = codeFromSms(sms);
    rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(svc.verify('0768680433', code)).rejects.toMatchObject({ status: 401 });
  });

  it('gives a new number a registration token bound to that phone', async () => {
    const { svc, sms, auth, jwt } = build();
    await svc.request('0768680433');
    const res: any = await svc.verify('0768680433', codeFromSms(sms));
    expect(res.needsRegistration).toBe(true);
    expect(jwt.verify(res.registrationToken).phone).toBe('+255768680433');

    const form = { firstName: 'A', lastName: 'B', registrationToken: res.registrationToken } as never;
    await svc.register({ ...(form as object), phone: '0768680433' } as never);
    expect(auth.registerVerifiedFarmer).toHaveBeenCalledWith(expect.objectContaining({ phone: '+255768680433' }));
    await expect(svc.register({ ...(form as object), phone: '0711111111' } as never)).rejects.toMatchObject({ status: 400 });
    await expect(svc.register({ phone: '0768680433', registrationToken: 'junk' } as never)).rejects.toMatchObject({ status: 401 });
    // A token minted for another purpose cannot be used.
    const other = jwt.sign({ phone: '+255768680433', purpose: 'x' });
    await expect(svc.register({ phone: '0768680433', registrationToken: other } as never)).rejects.toMatchObject({ status: 401 });
  });
});
