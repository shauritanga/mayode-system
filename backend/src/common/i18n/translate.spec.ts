import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { I18nExceptionFilter } from './i18n-exception.filter';
import { SW_MESSAGES } from './sw-messages';
import { languageFromHeader, translateMessage } from './translate';

describe('translateMessage', () => {
  it('translates a fixed message', () => {
    expect(translateMessage('Farm not found', 'sw')).toBe('Shamba halijapatikana');
  });

  it('fills inserted values into the Swahili wording', () => {
    expect(translateMessage('Farm with ID abc-1 not found', 'sw')).toBe('Shamba lenye kitambulisho abc-1 halijapatikana');
    expect(
      translateMessage('This boundary overlaps farm MYD-00006-02 by about 16,100 m² (1.61 ha). Walk only your own land, or ask the AMCOS to open a boundary dispute.', 'sw'),
    ).toContain('MYD-00006-02');
  });

  it('keeps English for English and for messages with no entry', () => {
    expect(translateMessage('Farm not found', 'en')).toBe('Farm not found');
    expect(translateMessage('Something nobody translated', 'sw')).toBe('Something nobody translated');
  });

  it('keeps the reason after an open-ended message', () => {
    expect(translateMessage('Failed to create user account: duplicate key', 'sw')).toBe('Imeshindwa kuunda akaunti ya mtumiaji: duplicate key');
  });

  it('translates common validation messages', () => {
    expect(translateMessage('firstName should not be empty', 'sw')).toBe('firstName haipaswi kuwa tupu');
  });

  it('reads the language from Accept-Language', () => {
    expect(languageFromHeader('sw')).toBe('sw');
    expect(languageFromHeader('sw-TZ,en;q=0.8')).toBe('sw');
    expect(languageFromHeader('en-US')).toBe('en');
    expect(languageFromHeader(undefined)).toBe('en');
  });
});

describe('I18nExceptionFilter', () => {
  const run = (exception: any, lang?: string) => {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host: any = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ headers: lang ? { 'accept-language': lang } : {} }) }) };
    new I18nExceptionFilter().catch(exception, host);
    return res;
  };

  it('answers in Swahili when the app asks for it, keeping the status and extra fields', () => {
    const res = run(new ConflictException({ statusCode: 409, code: 'PHONE_ALREADY_REGISTERED', message: 'This number is already registered. Log in instead.' }), 'sw');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 409, code: 'PHONE_ALREADY_REGISTERED', message: 'Namba hii tayari imesajiliwa. Ingia badala yake.' });
  });

  it('translates each message of a validation error list', () => {
    const res = run(new BadRequestException({ statusCode: 400, message: ['phone must be a string', 'The code is 6 digits'], error: 'Bad Request' }), 'sw');
    expect(res.json.mock.calls[0][0].message).toEqual(['phone lazima iwe maandishi', 'Msimbo una tarakimu 6']);
  });

  it('leaves English untouched without a language header', () => {
    const res = run(new BadRequestException('Farm not found'));
    expect(res.json).toHaveBeenCalledWith({ statusCode: 400, message: 'Farm not found', error: 'Bad Request' });
  });
});

/**
 * Every English message the server throws must have a Swahili entry, so a Swahili user never sees mixed
 * languages. When this fails, add the message to sw-messages.ts.
 */
describe('Swahili coverage of thrown messages', () => {
  const root = path.resolve(__dirname, '../..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
    }
  };
  walk(root);

  const norm = (m: string) => {
    let out = '';
    let n = 0;
    for (let i = 0; i < m.length; ) {
      if (m.startsWith('${', i)) {
        let depth = 1;
        let j = i + 2;
        while (j < m.length && depth) {
          if (m[j] === '{') depth++;
          else if (m[j] === '}') depth--;
          j++;
        }
        out += `{${n++}}`;
        i = j;
      } else out += m[i++];
    }
    return out.replace(/\\'/g, "'").replace(/\\`/g, '`').replace(/\\n/g, ' ');
  };

  it('has a Swahili entry for every message', () => {
    const exc = /new (?:BadRequest|NotFound|Conflict|Forbidden|Unauthorized|ServiceUnavailable|UnprocessableEntity|Gone|PayloadTooLarge|NotAcceptable|InternalServerError)Exception\(\s*|new HttpException\(\s*/g;
    const missing = new Set<string>();
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = exc.exec(s))) {
        const q = s[m.index + m[0].length];
        if (!['"', "'", '`'].includes(q)) continue;
        let j = m.index + m[0].length + 1;
        let depth = 0;
        while (j < s.length) {
          const c = s[j];
          if (c === '\\') { j += 2; continue; }
          if (q === '`' && c === '$' && s[j + 1] === '{') { depth++; j += 2; continue; }
          if (q === '`' && depth && c === '}') { depth--; j++; continue; }
          if (c === q && depth === 0) break;
          j++;
        }
        const message = norm(s.slice(m.index + m[0].length + 1, j));
        if (/^[A-Z_]+$/.test(message)) continue; // machine codes, not wording
        if (!(message in SW_MESSAGES)) missing.add(message);
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe('I18nResponseInterceptor', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { I18nResponseInterceptor } = require('./i18n-response.interceptor');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { of, lastValueFrom } = require('rxjs');
  const run = async (lang: string | undefined, data: unknown) => {
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ headers: lang ? { 'accept-language': lang } : {} }) }) };
    return lastValueFrom(new I18nResponseInterceptor().intercept(ctx, { handle: () => of(data) }));
  };

  it('translates server-written wording in Swahili responses, nested and in lists', async () => {
    const out = await run('sw', { data: [{ title: 'Harvest the rice', farm: { name: 'Kibada farm' }, tasks: [{ label: 'Grain moisture', unit: 'days' }] }] });
    expect(out).toEqual({ data: [{ title: 'Vuna mpunga', farm: { name: 'Kibada farm' }, tasks: [{ label: 'Unyevu wa punje', unit: 'siku' }] }] });
  });

  it('leaves text people typed exactly as saved', async () => {
    const out = await run('sw', { title: 'My own note', description: 'Harvest early please' });
    expect(out).toEqual({ title: 'My own note', description: 'Harvest early please' });
  });

  it('does not touch English responses, dates or non-text fields', async () => {
    const when = new Date();
    expect(await run('en', { title: 'Harvest the rice' })).toEqual({ title: 'Harvest the rice' });
    expect(await run('sw', { createdAt: when, count: 3, status: 'Certified seed' })).toEqual({ createdAt: when, count: 3, status: 'Certified seed' });
  });
});

describe('Swahili coverage of server-written text', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MBALARI_TASKS } = require('../../rice-protocols/rice-protocols.service');

  it('translates every rice calendar task, its guidance and its measurement labels', () => {
    const missing: string[] = [];
    for (const t of MBALARI_TASKS as any[]) {
      for (const text of [t.title, t.guidance, ...Object.values<any>(t.requiredMeasurements ?? {}).map((m) => m.label)]) {
        if (text && !(text in SW_MESSAGES)) missing.push(text);
      }
    }
    expect(missing).toEqual([]);
  });

  it('translates the wording written by the alert and advisory code', () => {
    const root = path.resolve(__dirname, '../..');
    const files = ['farm-alerts/farm-alerts.service.ts', 'integrations/integrations.service.ts', 'integrations/ai-enrichment.ts', 'rice-protocols/farming-history.service.ts'];
    const field = /\b(?:title|message|previewMessage|recommendation)\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
    const norm = (m: string) => {
      let out = '';
      let n = 0;
      for (let i = 0; i < m.length; ) {
        if (m.startsWith('${', i)) {
          let depth = 1;
          let j = i + 2;
          while (j < m.length && depth) { if (m[j] === '{') depth++; else if (m[j] === '}') depth--; j++; }
          out += `{${n++}}`;
          i = j;
        } else out += m[i++];
      }
      return out.replace(/\\u2019/g, '’').replace(/\\'/g, "'");
    };
    const missing = new Set<string>();
    for (const f of files) {
      const s = fs.readFileSync(path.join(root, f), 'utf8');
      let m: RegExpExecArray | null;
      while ((m = field.exec(s))) {
        const text = norm(m[2]);
        if (text.trim() && !(text in SW_MESSAGES)) missing.add(text);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
