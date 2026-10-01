const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadNavigation(mode = 'admin') {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const loaded = { exports: {} };
    cache.set(file, loaded.exports);
    vm.runInNewContext(compiled, {
      module: loaded, exports: loaded.exports,
      process: { env: { NEXT_PUBLIC_APP_MODE: mode } },
      require: (id) => id === '@hugeicons/core-free-icons' ? {} : id.startsWith('.')
        ? load(require('node:path').resolve(require('node:path').dirname(file), id + '.ts')) : require(id),
    });
    return loaded.exports;
  }
  return load(require.resolve('../src/lib/nav.ts'));
}
const { hasPermission, isPathAllowed, getVisibleGroups } = loadNavigation();
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

test('farmer navigation exposes personal pages without administrative grants', () => {
  const nav = loadNavigation('farmers');
  const farmer = { role: 'FARMER' };
  assert.equal(nav.landingFor('FARMER'), '/dashboard/farmer');
  const links = nav.getVisibleGroups(farmer).flatMap((g) => g.items.map((item) => item.href));
  assert.ok(links.includes('/dashboard/farmer'));
  assert.ok(links.includes('/dashboard/farmer/finance'));
  assert.equal(nav.isPathAllowed('/dashboard/farmer/farms', farmer), true);
  assert.equal(nav.isPathAllowed('/dashboard/farmer/unknown', farmer), false);
  assert.equal(nav.isPathAllowed('/dashboard/users', { role: 'SUPER_ADMIN' }), false);
  assert.equal(nav.isPathAllowed('/dashboard/farmer', { role: 'ADMIN' }), false);
});

test('cooperative grants cannot expose routes belonging to admin', () => {
  const nav = loadNavigation('cooperatives');
  const secretary = { role: 'MAMCOS_SECRETARY', roleId: 'r', permissions: [
    { resource: 'users', action: 'VIEW' }, { resource: 'farmers', action: 'VIEW' },
  ] };
  assert.equal(nav.isPathAllowed('/dashboard/farmers', secretary), true);
  assert.equal(nav.isPathAllowed('/dashboard/staff', secretary), true);
  assert.equal(nav.isPathAllowed('/dashboard/users', secretary), false);
  assert.equal(nav.isPathAllowed('/dashboard/roles', { role: 'SUPER_ADMIN' }), false);
  assert.equal(nav.isPathAllowed('/dashboard/farmer', secretary), false);
});

test('profile is reachable in all three portals', () => {
  for (const [mode, role] of [['farmers', 'FARMER'], ['cooperatives', 'MAMCOS_SECRETARY'], ['admin', 'ADMIN']]) {
    assert.equal(loadNavigation(mode).isPathAllowed('/dashboard/profile', { role }), true);
  }
});

test('every portal manifest section has a real route and no extra sections are shipped', () => {
  const { readdirSync, existsSync } = require('node:fs');
  const path = require('node:path');
  for (const mode of ['farmers', 'cooperatives', 'admin']) {
    const nav = loadNavigation(mode);
    const root = path.resolve(__dirname, '../apps', mode, 'src/app/dashboard');
    const sections = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    for (const section of sections) {
      assert.equal(nav.isPortalPath(`/dashboard/${section}`), true);
      assert.ok(existsSync(path.join(root, section, 'page.tsx')));
    }
    for (const section of readdirSync(path.resolve(__dirname, '../src/screens/dashboard'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
      assert.equal(nav.isPortalPath(`/dashboard/${section}`), sections.includes(section), `${mode}: ${section}`);
    }
  }
});
