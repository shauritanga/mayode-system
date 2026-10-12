import { SW_MESSAGES } from './sw-messages';

export type Lang = 'en' | 'sw';

/** The app sends its language as `Accept-Language`; anything that is not Swahili is served in English. */
export function languageFromHeader(header?: string | string[] | null): Lang {
  const value = Array.isArray(header) ? header[0] : header;
  return /^\s*sw\b/i.test(value ?? '') ? 'sw' : 'en';
}

type Entry = { re: RegExp; sw: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** English text (with {0}, {1}… for inserted values) → a matcher for the real message. */
function compile(english: string, sw: string): Entry {
  const open = english.endsWith(': '); // "Failed to create user account: <reason>"
  const source = english
    .split(/(\{\d+\})/)
    .map((part) => (/^\{\d+\}$/.test(part) ? '([\\s\\S]+?)' : escape(part)))
    .join('');
  return { re: new RegExp(`^${source}${open ? '([\\s\\S]*)' : ''}$`), sw: open ? `${sw}{__tail}` : sw };
}

let exact: Map<string, string> | null = null;
let patterns: Entry[] = [];

function init() {
  exact = new Map();
  patterns = [];
  for (const [en, sw] of Object.entries(SW_MESSAGES)) {
    if (/\{\d+\}/.test(en) || en.endsWith(': ')) patterns.push(compile(en, sw));
    else exact.set(en, sw);
  }
}

/** Swahili text for a server message, or the message unchanged when there is no entry for it. */
export function translateMessage(message: string, lang: Lang): string {
  if (lang !== 'sw' || !message) return message;
  if (!exact) init();
  const direct = exact!.get(message);
  if (direct) return direct;
  for (const { re, sw } of patterns) {
    const m = re.exec(message);
    if (!m) continue;
    const tail = sw.includes('{__tail}') ? (m[m.length - 1] ?? '') : '';
    return sw
      .replace('{__tail}', tail)
      .replace(/\{(\d+)\}/g, (_, i) => m[Number(i) + 1] ?? '');
  }
  return message;
}
