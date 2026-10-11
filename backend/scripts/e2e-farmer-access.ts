/**
 * Farmers have no role: check over real HTTP, with the real guards, that a role-less farmer can use
 * their own profile and records, cannot touch another farmer's, and cannot reach staff or admin
 * routes. Runs against the LOCAL database and removes everything it creates.
 *
 *   npx ts-node scripts/e2e-farmer-access.ts
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TAG = 'FA' + Date.now().toString().slice(-6);
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

  const phoneA = `07${TAG.slice(-6)}41`;
  const phoneB = `07${TAG.slice(-6)}42`;
  const norm = (p: string) => `+255${p.slice(1)}`;
  const phones = [norm(phoneA), norm(phoneB)];
  const hash = await bcrypt.hash('Secret123!', 10);
  const ua = await prisma.user.create({ data: { phone: norm(phoneA), passwordHash: hash, firstName: 'Aa', lastName: TAG, role: 'FARMER' } });
  const ub = await prisma.user.create({ data: { phone: norm(phoneB), passwordHash: hash, firstName: 'Bb', lastName: TAG, role: 'FARMER' } });
  const fa = await prisma.farmer.create({ data: { userId: ua.id, controlNumber: `${TAG}-A`, firstName: 'Aa', lastName: TAG } });
  const fb = await prisma.farmer.create({ data: { userId: ub.id, controlNumber: `${TAG}-B`, firstName: 'Bb', lastName: TAG } });

  try {
    const login = await call('POST', '/auth/login', undefined, { phone: phoneA, password: 'Secret123!' });
    const token = login.data?.accessToken as string;
    log(!!token && (login.status === 200 || login.status === 201), 'A role-less farmer can sign in', `HTTP ${login.status}`);

    let r = await call('GET', '/farmers/me', token);
    log(r.status === 200 && r.data?.id === fa.id, 'Reads their own farmer record', `HTTP ${r.status}`);
    r = await call('GET', `/farmers/${fa.id}`, token);
    log(r.status === 200, 'Reads their own record by id', `HTTP ${r.status}`);
    r = await call('PATCH', `/farmers/${fa.id}`, token, { village: 'Madibira' });
    log(r.status === 200 && r.data?.village === 'Madibira', 'Edits their own profile', `HTTP ${r.status}`);
    r = await call('PUT', `/farmers/${fa.id}/household`, token, { householdSize: 4 });
    log(r.status === 200 || r.status === 201, 'Updates their own household record', `HTTP ${r.status}`);
    r = await call('GET', `/farmers/${fa.id}/documents`, token);
    log(r.status === 200, 'Lists their own documents', `HTTP ${r.status}`);

    // Another farmer's data is off limits.
    r = await call('PATCH', `/farmers/${fb.id}`, token, { village: 'Hacked' });
    log(r.status === 403, "Cannot edit another farmer's profile", `HTTP ${r.status}`);
    r = await call('GET', `/farmers/${fb.id}`, token);
    log(r.status === 403 || r.status === 404, "Cannot read another farmer's record", `HTTP ${r.status}`);
    r = await call('PUT', `/farmers/${fb.id}/household`, token, { householdSize: 9 });
    log(r.status === 403, "Cannot change another farmer's household", `HTTP ${r.status}`);
    r = await call('GET', `/farmers/${fb.id}/documents`, token);
    log(r.status === 403, "Cannot list another farmer's documents", `HTTP ${r.status}`);
    const stored = await prisma.farmer.findUnique({ where: { id: fb.id }, select: { village: true } });
    log(stored?.village !== 'Hacked', "The other farmer's data is unchanged");

    // Documents: a farmer can delete their own, never another farmer's.
    const docB = await prisma.document.create({ data: { farmerId: fb.id, type: 'OTHER', fileUrl: '/x/' + TAG, fileName: 'b.pdf' } as any });
    r = await call('DELETE', `/farmers/documents/${docB.id}`, token);
    log(r.status === 403, "Cannot delete another farmer's document", `HTTP ${r.status}`);
    log(!!(await prisma.document.findUnique({ where: { id: docB.id } })), "The other farmer's document is still there");
    const docA = await prisma.document.create({ data: { farmerId: fa.id, type: 'OTHER', fileUrl: '/x/' + TAG, fileName: 'a.pdf' } as any });
    r = await call('DELETE', `/farmers/documents/${docA.id}`, token);
    log(r.status === 200, 'Deletes their own document', `HTTP ${r.status}`);
    r = await call('GET', `/farmers/${fb.id}/credit-score`, token);
    log(r.status === 403, "Cannot read another farmer's credit score", `HTTP ${r.status}`);

    // Staff and admin routes stay closed.
    for (const [method, path] of [
      ['GET', '/farmers'], ['GET', '/users'], ['GET', '/roles'], ['GET', '/settings/calendar'],
      ['POST', '/auth/staff'], ['GET', '/rice-varieties?includeInactive=true'],
    ] as const) {
      r = await call(method, path, token, method === 'POST' ? {} : undefined);
      const ok = path.startsWith('/rice-varieties') ? r.status === 200 : r.status === 403;
      log(ok, `${method} ${path} ${path.startsWith('/rice-varieties') ? 'is open to farmers (to pick a variety)' : 'is closed to farmers'}`, `HTTP ${r.status}`);
    }

    // The profile route on the users controller.
    r = await call('PUT', '/users/profile', token, { firstName: 'Aaa' });
    log(r.status === 200, 'Updates their own name through the profile route', `HTTP ${r.status}`);
  } finally {
    const ids = [ua.id, ub.id];
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.document.deleteMany({ where: { farmerId: { in: [fa.id, fb.id] } } });
    await prisma.household.deleteMany({ where: { farmerId: { in: [fa.id, fb.id] } } }).catch(() => undefined);
    await prisma.farmer.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    void phones;
    await app.close();
  }
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
