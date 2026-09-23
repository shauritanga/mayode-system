const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(require.resolve('../src/lib/nav.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
// Icons have no bearing on access decisions; omit the package's browser-only runtime.
vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: (id) => id === '@hugeicons/core-free-icons' ? {} : require(id) });
const { hasPermission, isPathAllowed, getVisibleGroups } = loaded.exports;
const custom = { role: 'CUSTOM', roleId: 'role-1', permissions: [{ resource: 'reports', action: 'VIEW' }] };

test('Admin has no implicit access', () => {
  assert.equal(hasPermission({ role: 'ADMIN' }, 'reports', 'VIEW'), false);
  assert.equal(isPathAllowed('/dashboard/reports', { role: 'ADMIN' }), false);
});
test('custom roles use their grants and cannot reach role management', () => {
  assert.equal(isPathAllowed('/dashboard/reports', custom), true);
  assert.equal(isPathAllowed('/dashboard/users', custom), false);
  assert.equal(isPathAllowed('/dashboard/roles', custom), false);
  assert.equal(isPathAllowed('/dashboard/not-a-real-route', custom), false);
  const links = getVisibleGroups(custom).flatMap((g) => g.items.map((item) => item.href));
  assert.ok(links.includes('/dashboard/reports'));
  assert.ok(!links.includes('/dashboard/roles'));
});
test('permission removal takes effect without enum fallback', () => {
  assert.equal(isPathAllowed('/dashboard/reports', { ...custom, permissions: [] }), false);
});
test('Super Admin retains role management and unrestricted grants', () => {
  assert.equal(isPathAllowed('/dashboard/roles', { role: 'SUPER_ADMIN' }), true);
  assert.equal(hasPermission({ role: 'SUPER_ADMIN' }, 'reports', 'DELETE'), true);
});
