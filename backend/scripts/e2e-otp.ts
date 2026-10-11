/**
 * End-to-end check of phone + SMS-code sign-in against the LOCAL database, over HTTP with the real
 * guards. SMS is simulated and the code is read from the dev echo. Everything created is removed.
 *
 *   npx ts-node scripts/e2e-otp.ts
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TAG = 'E2E' + Date.now().toString().slice(-6);
process.env.OTP_DEV_ECHO = 'true';
// Never send a real SMS from a test, even when the local .env holds real provider keys.
process.env.SMS_PROVIDER = 'simulated';
process.env.BEEM_API_KEY = '';
process.env.BEEM_SECRET_KEY = '';
process.env.AT_API_KEY = '';
let base = '';
let failures = 0;
const log = (ok: boolean, name: string, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
};
async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost') + '/api/v1';
  const prisma = app.get(PrismaService);
  // Farmers are not a role: accounts are created without one.
  const existing = `07${TAG.slice(-6)}11`;
  const fresh = `07${TAG.slice(-6)}22`;
  const buyer = `07${TAG.slice(-6)}33`;
  const norm = (p: string) => `+255${p.slice(1)}`;
  const hash = await bcrypt.hash('Secret123!', 10);
  const user = await prisma.user.create({ data: { phone: norm(existing), passwordHash: hash, firstName: 'Ex', lastName: TAG, role: 'FARMER' } });
  await prisma.farmer.create({ data: { userId: user.id, controlNumber: `${TAG}-1`, firstName: 'Ex', lastName: TAG } });
  const buyerUser = await prisma.user.create({ data: { phone: norm(buyer), passwordHash: hash, firstName: 'Bu', lastName: TAG, role: 'BUYER' } });

  try {
    // Existing farmer: request, wrong code, right code.
    let r = await call('POST', '/auth/otp/request', undefined, { phone: existing });
    log(r.status === 200 && !!r.data?.devCode, 'Code requested for an existing number', `HTTP ${r.status}`);
    const code = r.data?.devCode as string;
    const r2 = await call('POST', '/auth/otp/request', undefined, { phone: existing });
    log(r2.status === 429, 'Asking again at once is refused (cooldown)', `HTTP ${r2.status}`);
    const wrong = code === '000000' ? '111111' : '000000';
    r = await call('POST', '/auth/otp/verify', undefined, { phone: existing, code: wrong });
    log(r.status === 401, 'Wrong code is refused', `HTTP ${r.status}`);
    r = await call('POST', '/auth/otp/verify', undefined, { phone: existing, code });
    log(r.status === 200 && r.data?.needsRegistration === false && !!r.data?.accessToken, 'Right code signs in', `HTTP ${r.status}`);
    const me = await call('GET', '/auth/me', r.data?.accessToken);
    log(me.status === 200 && me.data?.phone === norm(existing), 'The session works', `HTTP ${me.status}`);
    r = await call('POST', '/auth/otp/verify', undefined, { phone: existing, code });
    log(r.status === 401, 'The same code cannot be used twice', `HTTP ${r.status}`);

    // The password route still works for web.
    r = await call('POST', '/auth/login', undefined, { phone: existing, password: 'Secret123!' });
    log(r.status === 201 || r.status === 200, 'Password login still works for the web', `HTTP ${r.status}`);

    // Phone number cannot be changed through the profile.
    const login = await call('POST', '/auth/login', undefined, { phone: existing, password: 'Secret123!' });
    r = await call('PUT', '/users/profile', login.data?.accessToken, { phone: '0700000000' });
    log(r.status === 400, 'The phone number cannot be changed from the profile', `HTTP ${r.status}`);

    // New number: verify, then finish sign-up with the form.
    r = await call('POST', '/auth/otp/request', undefined, { phone: fresh });
    const code2 = r.data?.devCode as string;
    r = await call('POST', '/auth/otp/verify', undefined, { phone: fresh, code: code2 });
    log(r.status === 200 && r.data?.needsRegistration === true && !!r.data?.registrationToken, 'A new number gets a registration token', `HTTP ${r.status}`);
    const token = r.data?.registrationToken as string;
    r = await call('POST', '/auth/otp/register', undefined, { phone: `07${TAG.slice(-6)}99`, firstName: 'N', lastName: TAG, registrationToken: token });
    log(r.status === 400, 'The form phone must match the verified phone', `HTTP ${r.status}`);
    r = await call('POST', '/auth/otp/register', undefined, { phone: fresh, firstName: 'New', lastName: TAG, region: 'Morogoro', registrationToken: token });
    log(r.status === 201 && !!r.data?.accessToken && !!r.data?.user?.controlNumber, 'Registration creates the farmer and signs in', `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`);
    const created = await prisma.user.findUnique({ where: { phone: norm(fresh) } });
    r = await call('POST', '/auth/login', undefined, { phone: fresh, password: '' });
    log(!!created && r.status === 400, 'The new account has no usable password', `HTTP ${r.status}`);

    // Web-only roles must use their password.
    r = await call('POST', '/auth/otp/request', undefined, { phone: buyer });
    r = await call('POST', '/auth/otp/verify', undefined, { phone: buyer, code: r.data?.devCode });
    log(r.status === 403, 'A buyer account is told to use the web password', `HTTP ${r.status}`);

    // Validation.
    r = await call('POST', '/auth/otp/request', undefined, { phone: 'abc' });
    log(r.status === 400, 'A malformed number is rejected', `HTTP ${r.status}`);
  } finally {
    const phones = [norm(existing), norm(fresh), norm(buyer)];
    await prisma.otpCode.deleteMany({ where: { phone: { in: phones } } });
    await prisma.smsLog.deleteMany({ where: { phone: { in: phones } } });
    const users = await prisma.user.findMany({ where: { phone: { in: phones } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.farmer.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    void buyerUser;
    await app.close();
  }
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
