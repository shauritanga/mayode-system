import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Private ("Relationship") listings.
 *
 * The owner gets a generated code to give to ONE chosen person. Only a keyed hash of it is stored.
 * The first renter to redeem it is recorded on the listing and is the only one who can take it.
 */

/** No 0/O, 1/I/L: a code read out over the phone or copied from SMS must not be misread. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const CODE_VALID_DAYS = 14;

export const MAX_FAILS_PER_LISTING = 5;
export const LISTING_WINDOW_MINUTES = 30;
export const MAX_FAILS_PER_FARMER = 15;
export const FARMER_WINDOW_MINUTES = 60;

/** e.g. "K7M4-QP2X": 31^8, about 8.5e11 possibilities. */
export function generateCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++)
    raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Case, spaces and dashes do not matter when a person types it in. */
export function normalizeCode(input: string): string {
  return (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function maskCode(): string {
  return '••••-••••';
}

function pepper(): string {
  return (
    process.env.LISTING_CODE_PEPPER ||
    process.env.JWT_SECRET ||
    'mayode-development-listing-code-pepper'
  );
}

export function hashCode(code: string): string {
  return createHmac('sha256', pepper())
    .update(normalizeCode(code))
    .digest('hex');
}

export function verifyCode(
  code: string,
  hash: string | null | undefined,
): boolean {
  if (!hash) return false;
  const a = Buffer.from(hashCode(code), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function expiryFromNow(now = new Date()): Date {
  return new Date(now.getTime() + CODE_VALID_DAYS * 86_400_000);
}

export interface AccessFields {
  ownerId: string;
  accessCodeHash?: string | null;
  accessCodeExpiresAt?: Date | null;
  claimedByFarmerId?: string | null;
}

/** A listing is private because it carries a code, not because of its deal type. */
export const isPrivate = (l: { accessCodeHash?: string | null }) =>
  !!l.accessCodeHash;

export type AccessState =
  | 'OPEN'
  | 'OWNER'
  | 'GRANTED'
  | 'NEEDS_CODE'
  | 'EXPIRED_OR_TAKEN';

/** What this viewer can do with the listing. `farmerId` is null for staff and anonymous viewers. */
export function accessStateFor(
  listing: AccessFields,
  farmerId: string | null,
  now = new Date(),
): AccessState {
  if (!isPrivate(listing)) return 'OPEN';
  if (farmerId && listing.ownerId === farmerId) return 'OWNER';
  if (farmerId && listing.claimedByFarmerId === farmerId) return 'GRANTED';
  if (listing.claimedByFarmerId) return 'EXPIRED_OR_TAKEN';
  if (
    listing.accessCodeExpiresAt &&
    listing.accessCodeExpiresAt.getTime() < now.getTime()
  )
    return 'EXPIRED_OR_TAKEN';
  return 'NEEDS_CODE';
}

/** Fields nobody outside the system may ever see. */
const SECRET_FIELDS = [
  'accessCodeHash',
  'accessCodeExpiresAt',
  'claimedByFarmerId',
  'claimedAt',
  'claimedByFarmer',
  'codeAttempts',
] as const;

/** Money and terms that give a private deal away to someone who has no access. */
const PRICE_FIELDS = [
  'askingPrice',
  'suggestedPrice',
  'finalPrice',
  'commissionAmount',
  'rentScheduleJson',
  'autoDropPrice',
  'autoDropDays',
] as const;

/**
 * Removes the secret fields, adds `isPrivate`, and (unless the viewer has access) hides the price
 * of a private listing. Returns a copy.
 */
export function redactForViewer<T extends Record<string, any>>(
  listing: T,
  state: AccessState,
): Record<string, any> {
  const out: Record<string, any> = { ...listing };
  const priv = isPrivate(listing);
  for (const f of SECRET_FIELDS) delete out[f];
  out.isPrivate = priv;
  out.accessState = state;
  // Always an explicit boolean: a screen that merges this over an earlier, hidden copy must see it flip.
  out.priceHidden = priv && state !== 'OWNER' && state !== 'GRANTED';
  if (out.priceHidden) for (const f of PRICE_FIELDS) delete out[f];
  return out;
}

export interface AttemptWindow {
  failsOnListing: number;
  failsAcrossListings: number;
}

/** Returns the reason a farmer must wait, or null if they may try. */
export function throttleReason(w: AttemptWindow): string | null {
  if (w.failsOnListing >= MAX_FAILS_PER_LISTING)
    return `Too many wrong codes for this listing. Try again in ${LISTING_WINDOW_MINUTES} minutes.`;
  if (w.failsAcrossListings >= MAX_FAILS_PER_FARMER)
    return `Too many wrong codes. Try again in ${FARMER_WINDOW_MINUTES} minutes.`;
  return null;
}
