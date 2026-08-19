/** Normalize Tanzanian phone numbers to E.164 (+255…). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('255')) return `+${digits}`;
  if (digits.startsWith('0')) return `+255${digits.slice(1)}`;
  if (digits.length === 9) return `+255${digits}`;
  return digits ? `+${digits}` : phone.trim();
}
