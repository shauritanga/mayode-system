import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { hashCode } from './listing-access';

const CODE = 'K7M4-QP2X';
const future = new Date(Date.now() + 5 * 86_400_000);
const past = new Date(Date.now() - 86_400_000);

const farmerUser = (id: string) => ({ id: `u-${id}`, role: 'FARMER' }) as any;
const staffUser = {
  id: 'staff',
  role: 'MAMCOS_SECRETARY',
  mamcosId: 'm1',
} as any;

function listing(over: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    farmId: 'f1',
    ownerId: 'owner',
    dealType: 'RELATIONSHIP',
    leaseStatus: 'DRAFT',
    askingPrice: 500000,
    isMultiYear: false,
    leaseDurationMonths: 12,
    paymentPlan: 'PREPAID',
    preferredRenterCode: null,
    accessCodeHash: hashCode(CODE),
    accessCodeExpiresAt: future,
    claimedByFarmerId: null,
    claimedAt: null,
    farm: { farmCode: 'FP-01', mamcosId: 'm1' },
    owner: {
      id: 'owner',
      firstName: 'Olga',
      lastName: 'Owner',
      user: { phone: '+255700000001' },
    },
    ...over,
  } as any;
}

function setup(l = listing(), fails = { listing: 0, across: 0 }) {
  const farmers: Record<string, any> = {
    'u-owner': {
      id: 'owner',
      userId: 'u-owner',
      firstName: 'Olga',
      lastName: 'Owner',
      controlNumber: 'MYD-00001',
      user: { phone: '+255700000001' },
    },
    'u-renter': {
      id: 'renter',
      userId: 'u-renter',
      firstName: 'Rita',
      lastName: 'Renter',
      controlNumber: 'MYD-00002',
      user: { phone: '+255700000002' },
    },
    'u-other': {
      id: 'other',
      userId: 'u-other',
      firstName: 'Omar',
      lastName: 'Other',
      controlNumber: 'MYD-00003',
      user: { phone: '+255700000003' },
    },
  };
  const attempts: any[] = [];
  const state = { listing: l };
  const prisma: any = {
    farmer: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.userId
          ? (farmers[where.userId] ?? null)
          : (Object.values(farmers).find((f) => f.id === where.id) ?? null),
      ),
    },
    landListing: {
      findUnique: jest.fn(async () => state.listing),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({
        ...listing({ dealType: data.dealType }),
        ...data,
        id: 'new',
        accessCodeHash: data.accessCodeHash ?? null,
        claimedByFarmerId: null,
      })),
      update: jest.fn(async ({ data }: any) => {
        state.listing = { ...state.listing, ...data };
        return state.listing;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.claimedByFarmerId === null && state.listing.claimedByFarmerId)
          return { count: 0 };
        state.listing = { ...state.listing, ...data };
        return { count: 1 };
      }),
    },
    landListingCodeAttempt: {
      count: jest.fn(async ({ where }: any) =>
        where.listingId ? fails.listing : fails.across,
      ),
      create: jest.fn(async ({ data }: any) => {
        attempts.push(data);
        return data;
      }),
    },
    landListingOffer: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    landListingSubLease: { findFirst: jest.fn().mockResolvedValue(null) },
    farm: { findUnique: jest.fn(), update: jest.fn() },
    mamcosStaff: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const sms = { send: jest.fn() };
  const pricing = {
    computeSuggestedPrice: jest
      .fn()
      .mockResolvedValue({ suggestedPrice: 480000 }),
    buildRentSchedule: jest.fn(),
  };
  const service = new MarketplaceService(
    prisma,
    { isConfigured: () => false } as any,
    sms as any,
    pricing as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma, sms, attempts, state };
}

describe('Creating a private (Relationship) listing', () => {
  const dto = {
    farmId: 'f1',
    ownerId: 'owner',
    askingPrice: 500000,
    dealType: 'RELATIONSHIP',
    leaseDurationMonths: 12,
  } as any;
  const farm = {
    id: 'f1',
    farmerId: 'owner',
    isVerified: true,
    isLeased: false,
    leaseLockedUntil: null,
    mamcosId: 'm1',
    farmCode: 'FP-01',
  };

  it('shows the generated code once, to the owner only, and stores just a hash', async () => {
    const { service, prisma, sms } = setup();
    prisma.farm.findUnique.mockResolvedValue(farm);
    prisma.farmer.findUnique.mockImplementation(async ({ where }: any) =>
      where.userId === 'u-owner'
        ? { id: 'owner' }
        : { id: 'owner', isBlacklisted: false },
    );
    const res = await service.createLandListing(dto, farmerUser('owner'));
    expect(res.accessCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const stored = prisma.landListing.create.mock.calls[0][0].data;
    expect(stored.accessCodeHash).toBe(hashCode(res.accessCode!));
    expect(JSON.stringify(stored)).not.toContain(res.accessCode);
    expect(stored.accessCodeExpiresAt.getTime()).toBeGreaterThan(
      Date.now() + 13 * 86_400_000,
    );
    expect(res).not.toHaveProperty('accessCodeHash');
    // SMS carries the code, but the log copy is masked.
    const [, text, type, logged] = sms.send.mock.calls.find(
      (c: any[]) => c[2] === 'mlax_private_code',
    );
    expect(text).toContain(res.accessCode);
    expect(logged).not.toContain(res.accessCode);
    expect(type).toBe('mlax_private_code');
  });

  it("never shows the code to a field officer or secretary who listed on the owner's behalf", async () => {
    const { service, prisma } = setup();
    prisma.farm.findUnique.mockResolvedValue(farm);
    prisma.farmer.findUnique.mockResolvedValue({
      id: 'owner',
      isBlacklisted: false,
    });
    const res = await service.createLandListing(dto, staffUser);
    expect(res).not.toHaveProperty('accessCode');
    expect(
      prisma.landListing.create.mock.calls[0][0].data.accessCodeHash,
    ).toBeTruthy();
  });

  it('gives no code to an ordinary listing', async () => {
    const { service, prisma } = setup();
    prisma.farm.findUnique.mockResolvedValue(farm);
    prisma.farmer.findUnique.mockResolvedValue({
      id: 'owner',
      isBlacklisted: false,
    });
    const res = await service.createLandListing(
      { ...dto, dealType: 'STANDARD' },
      farmerUser('owner'),
    );
    expect(res).not.toHaveProperty('accessCode');
    expect(
      prisma.landListing.create.mock.calls[0][0].data.accessCodeHash,
    ).toBeUndefined();
  });
});

describe('Redeeming the code', () => {
  it('binds the listing to the first person with the right code, and tells the owner', async () => {
    const { service, state, sms, attempts } = setup();
    const res = await service.redeemAccessCode(
      'l1',
      farmerUser('renter'),
      'k7m4 qp2x',
    );
    expect(state.listing.claimedByFarmerId).toBe('renter');
    expect(res.state).toBe('GRANTED');
    expect(res.listing.askingPrice).toBe(500000);
    expect(attempts.at(-1)).toMatchObject({
      farmerId: 'renter',
      success: true,
    });
    expect(sms.send).toHaveBeenCalledWith(
      '+255700000001',
      expect.stringContaining('Rita Renter entered your private code'),
      'mlax_private_code_used',
    );
    expect(JSON.stringify(sms.send.mock.calls)).not.toContain(CODE);
  });

  it('a second person cannot use the same code once it is taken, and is told nothing extra', async () => {
    const { service } = setup(listing({ claimedByFarmerId: 'renter' }));
    await expect(
      service.redeemAccessCode('l1', farmerUser('other'), CODE),
    ).rejects.toThrow('That code is not valid for this listing');
  });

  it('two people entering it at the same moment: only one wins', async () => {
    const { service, state } = setup();
    state.listing = listing(); // free when both read it
    const a = service.redeemAccessCode('l1', farmerUser('renter'), CODE);
    const b = service.redeemAccessCode('l1', farmerUser('other'), CODE);
    const results = await Promise.allSettled([a, b]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(state.listing.claimedByFarmerId).toBeTruthy();
  });

  it('a wrong code is refused and counted', async () => {
    const { service, attempts } = setup();
    await expect(
      service.redeemAccessCode('l1', farmerUser('renter'), 'AAAA-BBBB'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(attempts.at(-1)).toMatchObject({
      farmerId: 'renter',
      success: false,
    });
  });

  it('an expired code says so (and is not counted as a guess)', async () => {
    const { service, attempts } = setup(listing({ accessCodeExpiresAt: past }));
    await expect(
      service.redeemAccessCode('l1', farmerUser('renter'), CODE),
    ).rejects.toThrow('expired');
    expect(attempts).toHaveLength(0);
  });

  it('after too many wrong codes the farmer is stopped with HTTP 429, before the code is even checked', async () => {
    const { service } = setup(listing(), { listing: 5, across: 5 });
    const err = await service
      .redeemAccessCode('l1', farmerUser('renter'), CODE)
      .catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    const wide = setup(listing(), { listing: 0, across: 15 });
    await expect(
      wide.service.redeemAccessCode('l1', farmerUser('renter'), CODE),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('the owner cannot redeem their own listing; an open listing needs no code; a rented one is closed', async () => {
    await expect(
      setup().service.redeemAccessCode('l1', farmerUser('owner'), CODE),
    ).rejects.toThrow('do not need a code');
    await expect(
      setup(listing({ accessCodeHash: null })).service.redeemAccessCode(
        'l1',
        farmerUser('renter'),
        CODE,
      ),
    ).rejects.toThrow('does not need a code');
    await expect(
      setup(listing({ leaseStatus: 'ACTIVE' })).service.redeemAccessCode(
        'l1',
        farmerUser('renter'),
        CODE,
      ),
    ).rejects.toThrow('no longer open');
  });

  it('redeeming again as the same renter is harmless', async () => {
    const { service } = setup(listing({ claimedByFarmerId: 'renter' }));
    const res = await service.redeemAccessCode(
      'l1',
      farmerUser('renter'),
      'whatever',
    );
    expect(res.state).toBe('GRANTED');
  });
});

describe('Every way of taking a private listing needs the code', () => {
  it('offers are refused until the code has been redeemed, then allowed', async () => {
    const { service, prisma, state } = setup();
    prisma.landListingOffer.create.mockResolvedValue({ id: 'o1' });
    await expect(
      service.submitOffer('l1', 'renter', 400000),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.landListingOffer.create).not.toHaveBeenCalled();
    state.listing = listing({ claimedByFarmerId: 'renter' });
    await expect(
      service.submitOffer('l1', 'renter', 400000),
    ).resolves.toBeDefined();
    // ...and a different person is still locked out, even with the listing now taken
    await expect(
      service.submitOffer('l1', 'other', 400000),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a price quote is refused without access (it would reveal the price)', async () => {
    const { service } = setup();
    await expect(service.depositQuote('l1', 'other')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const bound = setup(listing({ claimedByFarmerId: 'renter' }));
    await expect(
      bound.service.depositQuote('l1', 'renter'),
    ).resolves.toMatchObject({ amount: 500000 });
  });

  it('a deposit is refused without access', async () => {
    const { service } = setup();
    await expect(
      service.depositEscrow('l1', { renterId: 'other', amount: 500000 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an approved sub-lease renter is chosen by the owner, so the code does not apply to that path', async () => {
    const { service, prisma } = setup(listing({ leaseStatus: 'ACTIVE' }));
    prisma.landListingSubLease.findFirst.mockResolvedValue({ id: 's1' });
    // gets past the code gate; the quote later fails for unrelated mocked reasons
    await expect(
      service.depositEscrow('l1', { renterId: 'other', amount: 1 } as any),
    ).rejects.not.toBeInstanceOf(ForbiddenException);
  });

  it('old listings that named a renter by control number still enforce it, now for offers too', async () => {
    const { service } = setup(
      listing({ accessCodeHash: null, preferredRenterCode: 'MYD-00002' }),
    );
    await expect(service.submitOffer('l1', 'other', 400000)).rejects.toThrow(
      'reserved for a specific renter',
    );
  });
});

describe('The owner replaces the code', () => {
  it('only the owner, only before a deposit, only on a Relationship deal', async () => {
    await expect(
      setup().service.regenerateAccessCode('l1', farmerUser('renter')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      setup(
        listing({ leaseStatus: 'PENDING_VERIFICATION' }),
      ).service.regenerateAccessCode('l1', farmerUser('owner')),
    ).rejects.toThrow('before a deposit');
    await expect(
      setup(listing({ dealType: 'STANDARD' })).service.regenerateAccessCode(
        'l1',
        farmerUser('owner'),
      ),
    ).rejects.toThrow('Relationship');
  });

  it("the new code works, the old one and its holder do not, and the holder's open offers are rejected", async () => {
    const { service, state, prisma, sms } = setup(
      listing({ claimedByFarmerId: 'renter' }),
    );
    const res = await service.regenerateAccessCode('l1', farmerUser('owner'));
    expect(res.accessCode).not.toBe(CODE);
    expect(hashCode(res.accessCode!)).toBe(state.listing.accessCodeHash);
    expect(state.listing.claimedByFarmerId).toBeNull();
    expect(prisma.landListingOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ farmerId: 'renter' }),
        data: { status: 'REJECTED' },
      }),
    );
    expect(sms.send.mock.calls.at(-1)[3]).not.toContain(res.accessCode);
    await expect(
      service.redeemAccessCode('l1', farmerUser('other'), CODE),
    ).rejects.toThrow('not valid');
    await expect(
      service.redeemAccessCode('l1', farmerUser('other'), res.accessCode),
    ).resolves.toMatchObject({ state: 'GRANTED' });
  });
});

describe('What people see', () => {
  it('a stranger sees the farm but not the price; the owner and the holder see everything', async () => {
    const { service } = setup(listing({ claimedByFarmerId: 'renter' }));
    const anon = service.publicListing(listing());
    expect(anon.isPrivate).toBe(true);
    expect(anon).not.toHaveProperty('askingPrice');
    expect(anon).not.toHaveProperty('accessCodeHash');
    expect(anon.farm.farmCode).toBe('FP-01');
    const owner = await service.accessFor('l1', farmerUser('owner'));
    expect(owner.state).toBe('OWNER');
    expect(owner.listing.askingPrice).toBe(500000);
    const holder = await service.accessFor('l1', farmerUser('renter'));
    expect(holder.listing.askingPrice).toBe(500000);
    const other = await service.accessFor('l1', farmerUser('other'));
    expect(other.state).toBe('EXPIRED_OR_TAKEN');
    expect(other.listing).not.toHaveProperty('askingPrice');
  });

  it("staff can see a private listing's details but the code and hash never leave the server", async () => {
    const { service } = setup();
    const res = await service.accessFor('l1', staffUser);
    expect(res.state).toBe('OWNER');
    expect(JSON.stringify(res)).not.toContain('accessCodeHash');
  });
});
