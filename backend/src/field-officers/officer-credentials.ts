import { randomInt } from 'crypto';

// No 0/O, 1/l/I: the password is read off an SMS and typed in.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = LETTERS + DIGITS;
const LENGTH = 10;

/** A random temporary password that always contains at least one letter and one digit. */
export function generateTemporaryPassword(): string {
  const pick = (set: string) => set[randomInt(0, set.length)];
  const chars = [pick(LETTERS), pick(DIGITS)];
  while (chars.length < LENGTH) chars.push(pick(ALPHABET));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface WelcomeSmsInput {
  firstName: string;
  phone: string;
  password: string;
  language?: string | null;
  portalUrl?: string;
  appUrl?: string;
  /** True when credentials are re-issued rather than a new account. */
  reissued?: boolean;
  /** Which account the details are for; defaults to a Field Officer. */
  account?: 'officer' | 'cooperative_admin' | 'staff' | 'farmer';
}

/** Told to a farmer who was made AMCOS staff on their existing login: nothing is reset. */
export function staffAccessSms(input: { firstName: string; language?: string | null; portalUrl?: string }): string {
  const { firstName, portalUrl } = input;
  return (input.language === 'en'
    ? [`Dear ${firstName}, you have been added as AMCOS staff.`, `Sign in to the cooperative dashboard with your usual phone number and password.`, portalUrl ? `Dashboard: ${portalUrl}` : '']
    : [`Ndugu ${firstName}, umeongezwa kuwa mfanyakazi wa AMCOS.`, `Ingia dashibodi ya ushirika kwa namba yako ya simu na nenosiri lako la kawaida.`, portalUrl ? `Dashibodi: ${portalUrl}` : '']
  ).filter(Boolean).join('\n');
}

/** The SMS an officer receives with their sign-in details (Swahili unless English is chosen). */
export function welcomeSms(input: WelcomeSmsInput): string {
  const { firstName, phone, password, portalUrl, appUrl, reissued } = input;
  const admin = input.account === 'cooperative_admin';
  const staff = input.account === 'staff';
  const farmer = input.account === 'farmer';
  if (input.language === 'en') {
    return [
      reissued
        ? `Dear ${firstName}, your sign-in details were reset.`
        : `Welcome to MAYODE, ${firstName}. Your ${admin ? 'cooperative administrator' : staff ? 'AMCOS staff' : farmer ? 'farmer' : 'Field Officer'} account is ready.`,
      `Dashboard login: ${phone} / ${password}`,
      portalUrl ? `Dashboard: ${portalUrl}` : '',
      `Mobile app: sign in with ${phone}; a code is sent by SMS.${appUrl ? ` Get the app: ${appUrl}` : ''}`,
      'You must change the password at first sign-in.',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    reissued
      ? `Ndugu ${firstName}, taarifa zako za kuingia zimebadilishwa.`
      : `Karibu MAYODE, ${firstName}. Akaunti yako ya ${admin ? 'msimamizi wa ushirika' : staff ? 'mfanyakazi wa ushirika' : farmer ? 'mkulima' : 'Afisa Ugani'} imeundwa.`,
    `Kuingia dashibodi: ${phone} / ${password}`,
    portalUrl ? `Dashibodi: ${portalUrl}` : '',
    `Programu ya simu: ingia kwa ${phone}; utatumiwa msimbo kwa SMS.${appUrl ? ` Pakua: ${appUrl}` : ''}`,
    'Badilisha nenosiri unapoingia mara ya kwanza.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** What is stored in the SMS log: the same text with the password hidden. */
export const redactPassword = (message: string, password: string) =>
  message.split(password).join('••••••••••');
