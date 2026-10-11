/**
 * End-to-end check of private ("Relationship") farm listings against the LOCAL database, over HTTP
 * with the real guards. Everything it creates is prefixed E2E<digits> and removed at the end.
 *
 *   npx ts-node scripts/e2e-private-listing.ts
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MarketplaceService } from '../src/marketplace/marketplace.service';

const TAG = 'E2E' + Date.now().toString().slice(-6);
let base = '';
let failures = 0;
const log = (ok: boolean, name: string, extra = '') => {
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`,
  );
};
async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, data };
}
const expectStatus = (
  name: string,
  r: { status: number; data: any },
  status: number | number[],
) => {
  const ok = Array.isArray(status)
    ? status.includes(r.status)
    : r.status === status;
  log(
    ok,
    name,
    ok ? '' : `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`,
  );
  return r.data;
};

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost') + '/api/v1';
  const prisma = app.get(PrismaService);
  const market = app.get(MarketplaceService);

  const pw = 'Secret123!';
  const hash = await bcrypt.hash(pw, 10);
  const role = await prisma.role.create({
    data: { name: `${TAG} Farmer`, systemRole: 'CUSTOM' },
  });
  const resources = await prisma.resource.findMany({
    where: { key: 'marketplace' },
  });
  await prisma.rolePermission.createMany({
    data: resources.flatMap((r) =>
      (['VIEW', 'CREATE', 'EDIT'] as const).map((action) => ({
        roleId: role.id,
        resourceId: r.id,
        action,
      })),
    ),
  });
  const people: Record<
    string,
    { farmerId: string; token: string; userId: string }
  > = {};
  let n = 0;
  for (const key of ['owner', 'renter1', 'renter2', 'renter3']) {
    n++;
    const phone = `+25574${TAG.slice(-6)}${n}`;
    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash: hash,
        firstName: key,
        lastName: TAG,
        role: 'FARMER',
        roleId: role.id,
      },
    });
    const farmer = await prisma.farmer.create({
      data: {
        userId: user.id,
        controlNumber: `${TAG}-${n}`,
        firstName: key,
        lastName: TAG,
      },
    });
    const login = await call('POST', '/auth/login', undefined, {
      phone,
      password: pw,
    });
    people[key] = {
      farmerId: farmer.id,
      userId: user.id,
      token: login.data?.accessToken,
    };
  }
  log(
    Object.values(people).every((p) => !!p.token),
    'Four farmers can sign in',
  );

  const mkFarm = (suffix: string) =>
    prisma.farm.create({
      data: {
        farmCode: `${TAG}-${suffix}`,
        name: TAG,
        socialHectares: 1,
        farmerId: people.owner.farmerId,
        isVerified: true,
      },
    });
  const privateFarm = await mkFarm('P');
  const openFarm = await mkFarm('O');

  try {
    // ---- create: the code is generated, shown once, only to the owner ----
    const created = expectStatus(
      'Owner lists a Relationship farm',
      await call('POST', '/marketplace/land', people.owner.token, {
        farmId: privateFarm.id,
        ownerId: people.owner.farmerId,
        askingPrice: 500000,
        dealType: 'RELATIONSHIP',
        leaseDurationMonths: 12,
      }),
      [200, 201],
    );
    const code: string = created?.accessCode;
    log(
      /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code ?? ''),
      'A code like K7M4-QP2X is generated',
      code,
    );
    log(
      !('accessCodeHash' in created) && created?.isPrivate === true,
      'The hash is never returned',
    );
    const row = await prisma.landListing.findUnique({
      where: { id: created.id },
    });
    log(
      !!row?.accessCodeHash &&
        !JSON.stringify(row).includes(code.replace('-', '')) &&
        !JSON.stringify(row).includes(code),
      'Only a hash is stored',
    );
    log(
      !!row?.accessCodeExpiresAt &&
        row.accessCodeExpiresAt.getTime() > Date.now() + 13 * 86_400_000,
      'Valid for 14 days',
    );
    const sms = await prisma.smsLog.findMany({
      where: {
        type: 'mlax_private_code',
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    log(
      sms.length >= 1 && sms.every((s) => !s.message.includes(code)),
      'The SMS log never holds the code',
    );
    const open = expectStatus(
      'An ordinary listing gets no code',
      await call('POST', '/marketplace/land', people.owner.token, {
        farmId: openFarm.id,
        ownerId: people.owner.farmerId,
        askingPrice: 300000,
        dealType: 'STANDARD',
        leaseDurationMonths: 12,
      }),
      [200, 201],
    );
    log(
      !open.accessCode && open.isPrivate === false,
      'Standard listing is public and has no code',
    );

    // ---- visible but locked ----
    const browse = expectStatus(
      'Anyone can browse listings',
      await call('GET', '/marketplace/land'),
      200,
    );
    const seen = browse.find((l: any) => l.id === created.id);
    log(
      !!seen &&
        seen.isPrivate === true &&
        !('askingPrice' in seen) &&
        !('accessCodeHash' in seen),
      'Private listing is visible but its price and hash are hidden',
    );
    log(
      browse.find((l: any) => l.id === open.id)?.askingPrice === 300000,
      'The ordinary listing still shows its price',
    );
    const asStranger = expectStatus(
      'A stranger checks access',
      await call(
        'GET',
        `/marketplace/land/${created.id}/access`,
        people.renter2.token,
      ),
      200,
    );
    log(
      asStranger.state === 'NEEDS_CODE' &&
        !('askingPrice' in asStranger.listing),
      'Stranger: needs a code, no price',
    );

    // ---- locked out without the code ----
    expectStatus(
      'Offer without the code is refused',
      await call(
        'POST',
        `/marketplace/land/${created.id}/offers`,
        people.renter2.token,
        { farmerId: people.renter2.farmerId, offerAmount: 400000 },
      ),
      403,
    );
    expectStatus(
      'Price quote without the code is refused',
      await call(
        'GET',
        `/marketplace/land/${created.id}/quote`,
        people.renter2.token,
      ),
      403,
    );
    const dep = await market
      .depositEscrow(created.id, {
        renterId: people.renter2.farmerId,
        amount: 500000,
      } as any)
      .catch((e) => e);
    log(
      dep?.status === 403 || dep?.getStatus?.() === 403,
      'A deposit without the code is refused',
    );

    // ---- guessing is throttled ----
    for (let i = 0; i < 5; i++)
      expectStatus(
        `Wrong code ${i + 1} refused`,
        await call(
          'POST',
          `/marketplace/land/${created.id}/redeem-code`,
          people.renter2.token,
          { code: 'AAAA-BBB' + i },
        ),
        400,
      );
    expectStatus(
      'The 6th guess is stopped',
      await call(
        'POST',
        `/marketplace/land/${created.id}/redeem-code`,
        people.renter2.token,
        { code },
      ),
      429,
    );

    // ---- the right person redeems it ----
    const granted = expectStatus(
      'Renter 1 enters the right code',
      await call(
        'POST',
        `/marketplace/land/${created.id}/redeem-code`,
        people.renter1.token,
        { code: code.toLowerCase().replace('-', ' ') },
      ),
      [200, 201],
    );
    log(
      granted.state === 'GRANTED' && granted.listing?.askingPrice === 500000,
      'Renter 1 is granted access and sees the price',
    );
    expectStatus(
      'Renter 3 cannot use the same code',
      await call(
        'POST',
        `/marketplace/land/${created.id}/redeem-code`,
        people.renter3.token,
        { code },
      ),
      400,
    );
    expectStatus(
      'Owner cannot redeem their own listing',
      await call(
        'POST',
        `/marketplace/land/${created.id}/redeem-code`,
        people.owner.token,
        { code },
      ),
      400,
    );
    const quote = expectStatus(
      'Renter 1 can get a quote',
      await call(
        'GET',
        `/marketplace/land/${created.id}/quote`,
        people.renter1.token,
      ),
      200,
    );
    log(quote.amount === 500000, 'Quote shows the price', String(quote.amount));
    const offer = expectStatus(
      'Renter 1 can make an offer',
      await call(
        'POST',
        `/marketplace/land/${created.id}/offers`,
        people.renter1.token,
        { farmerId: people.renter1.farmerId, offerAmount: 450000 },
      ),
      [200, 201],
    );
    expectStatus(
      'Renter 3 still cannot make an offer',
      await call(
        'POST',
        `/marketplace/land/${created.id}/offers`,
        people.renter3.token,
        { farmerId: people.renter3.farmerId, offerAmount: 450000 },
      ),
      403,
    );
    const dep3 = await market
      .depositEscrow(created.id, {
        renterId: people.renter3.farmerId,
        amount: 500000,
      } as any)
      .catch((e) => e);
    log(
      dep3?.status === 403 || dep3?.getStatus?.() === 403,
      'Renter 3 cannot deposit either',
    );

    // ---- owner and staff views ----
    const managed = expectStatus(
      'Owner lists their listings',
      await call('GET', '/marketplace/land/manage', people.owner.token),
      200,
    );
    const mine = managed.find((l: any) => l.id === created.id);
    log(
      mine?.privateDeal?.claimedBy === `renter1 ${TAG}` &&
        !('accessCodeHash' in mine),
      'Owner sees who holds the code, never the hash',
      mine?.privateDeal?.claimedBy,
    );
    const renterView = expectStatus(
      'Renter 1 lists their deals',
      await call('GET', '/marketplace/land/manage', people.renter1.token),
      200,
    );
    log(Array.isArray(renterView), 'Renter view loads');
    expectStatus(
      "A renter cannot replace the owner's code",
      await call(
        'POST',
        `/marketplace/land/${created.id}/regenerate-code`,
        people.renter1.token,
      ),
      403,
    );

    // ---- the owner replaces the code ----
    const fresh = expectStatus(
      'Owner generates a new code',
      await call(
        'POST',
        `/marketplace/land/${created.id}/regenerate-code`,
        people.owner.token,
      ),
      [200, 201],
    );
    log(
      fresh.accessCode && fresh.accessCode !== code,
      'A different code is issued',
      fresh.accessCode,
    );
    const rotated = await prisma.landListing.findUnique({
      where: { id: created.id },
    });
    log(rotated?.claimedByFarmerId === null, "Renter 1's binding is cleared");
    const offerAfter = await prisma.landListingOffer.findUnique({
      where: { id: offer.id },
    });
    log(offerAfter?.status === 'REJECTED', "Renter 1's open offer is rejected");
    expectStatus(
      'Renter 1 is locked out again',
      await call(
        'POST',
        `/marketplace/land/${created.id}/offers`,
        people.renter1.token,
        { farmerId: people.renter1.farmerId, offerAmount: 450000 },
      ),
      403,
    );
    expectStatus(
      'The old code no longer works',
      await call(
        'POST',
        `/marketplace/land/${created.id}/redeem-code`,
        people.renter3.token,
        { code },
      ),
      400,
    );
    expectStatus(
      'The new code works for Renter 3',
      await call(
        'POST',
        `/marketplace/land/${created.id}/redeem-code`,
        people.renter3.token,
        { code: fresh.accessCode },
      ),
      [200, 201],
    );

    // ---- expiry ----
    const farm3 = await mkFarm('X');
    const l3 = expectStatus(
      'A second private listing',
      await call('POST', '/marketplace/land', people.owner.token, {
        farmId: farm3.id,
        ownerId: people.owner.farmerId,
        askingPrice: 200000,
        dealType: 'RELATIONSHIP',
        leaseDurationMonths: 12,
      }),
      [200, 201],
    );
    await prisma.landListing.update({
      where: { id: l3.id },
      data: { accessCodeExpiresAt: new Date(Date.now() - 1000) },
    });
    const exp = await call(
      'POST',
      `/marketplace/land/${l3.id}/redeem-code`,
      people.renter1.token,
      { code: l3.accessCode },
    );
    log(
      exp.status === 400 && /expired/.test(JSON.stringify(exp.data)),
      'An expired code says so',
    );

    // ---- a returning renter's loyalty price must not make a public listing private ----
    const loyal = await prisma.landListing.findUnique({
      where: { id: open.id },
    });
    log(
      loyal?.accessCodeHash === null,
      'Pricing labels never create a private listing',
    );
  } finally {
    await prisma.landListingCodeAttempt.deleteMany({
      where: { farmer: { lastName: TAG } },
    });
    await prisma.landListingOffer.deleteMany({
      where: { listing: { farm: { name: TAG } } },
    });
    await prisma.escrowPayment
      .deleteMany({ where: { listing: { farm: { name: TAG } } } })
      .catch(() => undefined);
    await prisma.landListing.deleteMany({ where: { farm: { name: TAG } } });
    await prisma.farm.deleteMany({ where: { name: TAG } });
    await prisma.smsLog.deleteMany({
      where: { phone: { startsWith: '+25574' + TAG.slice(-6) } },
    });
    await prisma.refreshToken
      .deleteMany({ where: { user: { lastName: TAG } } })
      .catch(() => undefined);
    await prisma.farmer.deleteMany({ where: { lastName: TAG } });
    await prisma.user.deleteMany({ where: { lastName: TAG } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.role.deleteMany({ where: { id: role.id } });
    await app.close();
  }
  console.log(
    failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED',
  );
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(2);
});
