import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/** Money in SMS, notes and PDFs must carry thousands commas whatever the server's language setting is. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

describe('number formatting on the server', () => {
  it('never calls toLocaleString() with no locale on a number', () => {
    const offenders = files(join(__dirname, '..'))
      .flatMap((p) => readFileSync(p, 'utf8').split('\n').map((line, i) => ({ p, line, n: i + 1 })))
      .filter(({ line }) => /\.toLocaleString\(\)/.test(line) && !/new Date\(/.test(line))
      .map(({ p, n }) => `${p.split('/src/')[1]}:${n}`);
    expect(offenders).toEqual([]);
  });
});
