const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/** Numbers and money must carry thousands commas whatever language the browser is set to, so no unlocaled toLocaleString on a number. */
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test('no number is formatted with the browser locale', () => {
  const root = path.join(__dirname, '..', 'src');
  const offenders = [];
  for (const p of files(root)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (/\.toLocaleString\(\)/.test(line) && !/new Date\(/.test(line)) offenders.push(`${path.relative(root, p)}:${i + 1}`);
      if (/\.toLocaleString\(undefined/.test(line) && !/new Date\(/.test(line) && !/dateStyle/.test(line)) offenders.push(`${path.relative(root, p)}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(offenders, []);
});
