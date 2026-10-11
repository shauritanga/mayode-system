import {
  accessStateFor,
  CODE_VALID_DAYS,
  expiryFromNow,
  generateCode,
  hashCode,
  isPrivate,
  maskCode,
  normalizeCode,
  redactForViewer,
  throttleReason,
  verifyCode,
} from './listing-access';

describe('private listing codes', () => {
  it('generates 8 unambiguous characters in two groups, and never repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
      seen.add(code);
    }
    expect(seen.size).toBe(500);
  });

  it('ignores case, spaces and dashes when typed in', () => {
    expect(normalizeCode(' k7m4 - qp2x ')).toBe('K7M4QP2X');
    expect(verifyCode('k7m4qp2x', hashCode('K7M4-QP2X'))).toBe(true);
    expect(verifyCode('K7M4 QP2X', hashCode('K7M4-QP2X'))).toBe(true);
  });

  it('rejects a wrong code, an empty code and a missing hash; the hash is not the code', () => {
    const hash = hashCode('K7M4-QP2X');
    expect(verifyCode('K7M4-QP2Y', hash)).toBe(false);
    expect(verifyCode('', hash)).toBe(false);
    expect(verifyCode('K7M4-QP2X', null)).toBe(false);
    expect(hash).not.toContain('K7M4');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('masks the code for logs', () => {
    expect(maskCode()).toBe('••••-••••');
  });

  it('expires after the agreed number of days', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(expiryFromNow(now).getTime() - now.getTime()).toBe(
      CODE_VALID_DAYS * 86_400_000,
    );
    expect(CODE_VALID_DAYS).toBe(14);
  });
});

describe('who may take a private listing', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  const base = {
    ownerId: 'owner',
    accessCodeHash: 'h',
    accessCodeExpiresAt: future,
    claimedByFarmerId: null,
  };

  it('a listing without a code is open to everyone', () => {
    expect(isPrivate({ accessCodeHash: null })).toBe(false);
    expect(accessStateFor({ ownerId: 'owner' }, 'anyone')).toBe('OPEN');
  });

  it('owner, bound renter, everyone else', () => {
    expect(accessStateFor(base, 'owner')).toBe('OWNER');
    expect(
      accessStateFor({ ...base, claimedByFarmerId: 'renter' }, 'renter'),
    ).toBe('GRANTED');
    expect(accessStateFor(base, 'stranger')).toBe('NEEDS_CODE');
    expect(accessStateFor(base, null)).toBe('NEEDS_CODE');
  });

  it('once bound, other people cannot use the same code, even if it has not expired', () => {
    expect(
      accessStateFor({ ...base, claimedByFarmerId: 'renter' }, 'stranger'),
    ).toBe('EXPIRED_OR_TAKEN');
  });

  it('an expired code blocks new people, but not the renter already bound to it', () => {
    expect(
      accessStateFor({ ...base, accessCodeExpiresAt: past }, 'stranger'),
    ).toBe('EXPIRED_OR_TAKEN');
    expect(
      accessStateFor(
        { ...base, accessCodeExpiresAt: past, claimedByFarmerId: 'renter' },
        'renter',
      ),
    ).toBe('GRANTED');
  });
});

describe('what a viewer is allowed to see', () => {
  const listing = {
    id: 'l',
    ownerId: 'o',
    askingPrice: 500000,
    suggestedPrice: 450000,
    finalPrice: null,
    commissionAmount: 25000,
    rentScheduleJson: [1],
    accessCodeHash: 'h',
    accessCodeExpiresAt: new Date(),
    claimedByFarmerId: 'r',
    claimedAt: new Date(),
    farm: { farmCode: 'F1' },
  };

  it('never exposes the hash, expiry or who holds it', () => {
    const out = redactForViewer(listing, 'OWNER');
    for (const f of [
      'accessCodeHash',
      'accessCodeExpiresAt',
      'claimedByFarmerId',
      'claimedAt',
    ])
      expect(out).not.toHaveProperty(f);
    expect(out.isPrivate).toBe(true);
  });

  it('hides the price and terms from a stranger but not from the owner or the bound renter', () => {
    const stranger = redactForViewer(listing, 'NEEDS_CODE');
    for (const f of [
      'askingPrice',
      'suggestedPrice',
      'finalPrice',
      'commissionAmount',
      'rentScheduleJson',
    ])
      expect(stranger).not.toHaveProperty(f);
    expect(stranger.priceHidden).toBe(true);
    expect(stranger.farm.farmCode).toBe('F1');
    expect(redactForViewer(listing, 'OWNER').askingPrice).toBe(500000);
    expect(redactForViewer(listing, 'GRANTED').askingPrice).toBe(500000);
    expect(redactForViewer(listing, 'GRANTED').priceHidden).toBe(false);
    expect(redactForViewer(listing, 'OWNER').priceHidden).toBe(false);
  });

  it('leaves an open listing exactly as it was, just flagged as not private', () => {
    const open = redactForViewer({ ...listing, accessCodeHash: null }, 'OPEN');
    expect(open.askingPrice).toBe(500000);
    expect(open.isPrivate).toBe(false);
    expect(open.priceHidden).toBe(false);
  });
});

describe('guessing is throttled', () => {
  it('stops after 5 wrong codes on one listing or 15 across listings', () => {
    expect(
      throttleReason({ failsOnListing: 4, failsAcrossListings: 14 }),
    ).toBeNull();
    expect(
      throttleReason({ failsOnListing: 5, failsAcrossListings: 5 }),
    ).toMatch(/this listing/);
    expect(
      throttleReason({ failsOnListing: 1, failsAcrossListings: 15 }),
    ).toMatch(/Too many wrong codes/);
  });
});
