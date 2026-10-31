import { randomBytes } from 'crypto';

/** What a person types is compared without case, spaces or dashes mattering. */
export const normalizeAmcosCode = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();

/** e.g. "Madibira AMCOS" → "MAD-4F2A91": three letters of the name, then six random hex characters. */
export function generateAmcosCode(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  return `${letters}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
