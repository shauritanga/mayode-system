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
function loadAppMode(mode = 'admin') {
  const compiled = ts.transpileModule(readFileSync(require.resolve('../src/lib/app-mode.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, process: { env: { NEXT_PUBLIC_APP_MODE: mode } } });
  return loaded.exports;
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
  assert.equal(nav.isPathAllowed('/dashboard/farmer', secretary), false);
  assert.equal(nav.isPathAllowed('/dashboard/locations', secretary), false);
  assert.equal(nav.isPathAllowed('/dashboard/mamcos', secretary), false);
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

test('previously orphaned admin pages are shipped and reachable with the right grants', () => {
  const { existsSync } = require('node:fs');
  const path = require('node:path');
  const nav = loadNavigation('admin');
  const root = path.resolve(__dirname, '../apps/admin/src/app/dashboard');
  const full = { role: 'CUSTOM', roleId: 'r', permissions: ['farm_alerts', 'rewards', 'buyers', 'facilities'].map((resource) => ({ resource, action: 'VIEW' })) };
  for (const section of ['alerts', 'rewards', 'buyers', 'facilities']) {
    assert.ok(existsSync(path.join(root, section, 'page.tsx')), section);
    assert.equal(nav.isPathAllowed(`/dashboard/${section}`, full), true, section);
    assert.equal(nav.isPathAllowed(`/dashboard/${section}`, { role: 'SUPER_ADMIN' }), true, section);
    assert.equal(nav.isPathAllowed(`/dashboard/${section}`, { role: 'CUSTOM', roleId: 'r', permissions: [] }), false, section);
  }
});

test('persona dashboards are hidden from Super Admin and generic roles but stay routable', () => {
  const personas = ['/dashboard/field-officer', '/dashboard/auditor', '/dashboard/financial-provider', '/dashboard/buyer'];
  const links = (subject) => getVisibleGroups(subject).flatMap((g) => g.items.map((i) => i.href));
  const everything = ['farmers', 'reports', 'buyer_portal'].map((resource) => ({ resource, action: 'VIEW' }));
  for (const href of personas) {
    assert.ok(!links({ role: 'SUPER_ADMIN' }).includes(href), `super admin ${href}`);
    assert.ok(!links({ role: 'CUSTOM', roleId: 'r', permissions: everything }).includes(href), `custom ${href}`);
    assert.equal(isPathAllowed(href, { role: 'SUPER_ADMIN' }), true, `route ${href}`);
  }
  const auditor = { role: 'AUDITOR', roleId: 'r', permissions: everything };
  assert.ok(links(auditor).includes('/dashboard/auditor'));
  assert.ok(links({ role: 'BUYER', roleId: 'r', permissions: everything }).includes('/dashboard/buyer'));
  assert.ok(links({ role: 'FIELD_OFFICER', roleId: 'r', permissions: [] }).includes('/dashboard/field-officer'));
});

test('cooperative admins reach Roles only with the matching grant; User Accounts is not offered in the AMCOS portal', () => {
  const nav = loadNavigation('cooperatives');
  const admin = (...resources) => ({ role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: resources.map((resource) => ({ resource, action: 'VIEW' })) });
  assert.equal(nav.isPathAllowed('/dashboard/users', admin('users')), false);
  assert.equal(nav.isPathAllowed('/dashboard/roles', admin('roles')), true);
  assert.equal(nav.isPathAllowed('/dashboard/roles', admin('users')), false);
  assert.equal(nav.isPathAllowed('/dashboard/users', admin('roles')), false);
  const links = nav.getVisibleGroups(admin('users', 'roles')).flatMap((g) => g.items.map((i) => i.href));
  assert.ok(!links.includes('/dashboard/users') && links.includes('/dashboard/roles'));
});

test('platform role management stays Super Admin only in the admin portal', () => {
  const nav = loadNavigation('admin');
  const custom = { role: 'CUSTOM', roleId: 'r', permissions: [{ resource: 'roles', action: 'VIEW' }] };
  assert.equal(nav.isPathAllowed('/dashboard/roles', custom), false);
  assert.equal(nav.isPathAllowed('/dashboard/roles', { role: 'SUPER_ADMIN' }), true);
});

test('portal access follows the account\'s cooperative, not a role label', () => {
  const mode = loadAppMode;
  const coopAdmin = { role: 'CUSTOM', mamcosId: 'm1' };
  const platformStaff = { role: 'CUSTOM' };
  assert.equal(mode('cooperatives').isAccountAllowedInMode('cooperatives', coopAdmin), true);
  assert.equal(mode('admin').isAccountAllowedInMode('admin', coopAdmin), false);
  assert.equal(mode('admin').isAccountAllowedInMode('admin', platformStaff), true);
  assert.equal(mode('cooperatives').isAccountAllowedInMode('cooperatives', platformStaff), false);
  assert.equal(mode('admin').isAccountAllowedInMode('admin', { role: 'SUPER_ADMIN' }), true);
  assert.equal(mode('cooperatives').isAccountAllowedInMode('cooperatives', { role: 'SUPER_ADMIN' }), false);
  for (const m of ['cooperatives', 'admin']) assert.equal(mode(m).isAccountAllowedInMode(m, { role: 'FIELD_OFFICER', mamcosId: 'm1' }), true);
  assert.equal(mode('cooperatives').isAccountAllowedInMode('cooperatives', { role: 'MAMCOS_SECRETARY' }), true);
  assert.equal(mode('admin').isAccountAllowedInMode('admin', { role: 'MAMCOS_SECRETARY' }), false);
  assert.equal(mode('farmers').isAccountAllowedInMode('farmers', { role: 'FARMER' }), true);
  assert.equal(mode('admin').isAccountAllowedInMode('admin', { role: 'FARMER' }), false);
  assert.deepEqual([...mode('admin').allowedHostsFor(coopAdmin)], ['cooperatives.mayodegroup.com']);
});

test('sale workflow pages ship in both portals and follow their own grants', () => {
  const { existsSync } = require('node:fs');
  const path = require('node:path');
  const grants = (...resources) => ({ role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: resources.map((resource) => ({ resource, action: 'VIEW' })) });
  const pages = { 'sale-orders': 'sale_orders', warehouse: 'warehouse_desk', 'audit-log': 'audit_logs' };
  for (const mode of ['admin', 'cooperatives']) {
    const nav = loadNavigation(mode);
    for (const [section, resource] of Object.entries(pages)) {
      assert.ok(existsSync(path.resolve(__dirname, '../apps', mode, 'src/app/dashboard', section, 'page.tsx')), `${mode}/${section}`);
      assert.equal(nav.isPathAllowed(`/dashboard/${section}`, grants(resource)), true, `${mode}/${section} with grant`);
      assert.equal(nav.isPathAllowed(`/dashboard/${section}`, grants('reports')), false, `${mode}/${section} without grant`);
      if (mode === 'admin') assert.equal(nav.isPathAllowed(`/dashboard/${section}`, { role: 'SUPER_ADMIN' }), true, `${section} super admin`);
    }
  }
  // A salesperson (sale_orders only) cannot open the keeper desk, and a keeper cannot open orders.
  const nav = loadNavigation('cooperatives');
  assert.equal(nav.isPathAllowed('/dashboard/warehouse', grants('sale_orders')), false);
  assert.equal(nav.isPathAllowed('/dashboard/sale-orders', grants('warehouse_desk')), false);
  // Buyers are now a cooperative page too.
  assert.equal(nav.isPathAllowed('/dashboard/buyers', grants('buyers')), true);
});

test('Accounting & Finance navigation exposes all workspaces behind the accounting grant', () => {
  const nav = loadNavigation('cooperatives');
  const group = nav.navGroups.find((entry) => entry.items.some((item) => item.href === '/dashboard/accounting'));
  assert.ok(group);
  const parent = group.items[0];
  assert.equal(parent.label, 'Accounting & Finance');
  assert.equal(parent.resource, 'accounting');
  assert.equal(parent.children.length, 11);
  assert.equal(parent.children.reduce((count, category) => count + category.children.length, 0), 39);
  const granted = { role: 'CUSTOM', roleId: 'r', permissions: [{ resource: 'accounting', action: 'VIEW' }] };
  assert.equal(nav.isPathAllowed('/dashboard/accounting', granted), true);
  assert.equal(nav.isPathAllowed('/dashboard/accounting/general-ledger/trial-balance', granted), true);
  assert.equal(nav.isPathAllowed('/dashboard/accounting/not-a-real-page', granted), false);
  assert.equal(nav.isPathAllowed('/dashboard/accounting/general-ledger/trial-balance', { ...granted, permissions: [] }), false);
  for (const mode of ['admin', 'cooperatives']) {
    const root = require('node:path').resolve(__dirname, '../apps', mode, 'src/app/dashboard/accounting');
    assert.ok(require('node:fs').existsSync(require('node:path').join(root, 'page.tsx')));
    assert.ok(require('node:fs').existsSync(require('node:path').join(root, '[...slug]', 'page.tsx')));
  }
});

test('irrigation section follows its three permission resources', () => {
  const nav = loadNavigation('cooperatives');
  const grants = (...resources) => ({ role: 'CUSTOM', roleId: 'r', permissions: resources.map((resource) => ({ resource, action: 'VIEW' })) });
  const links = (user) => nav.getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href));
  assert.ok(!links({ role: 'SUPER_ADMIN' }).includes('/dashboard/irrigation'), 'no sidebar entry; its pages live in three newer menus');
  assert.equal(nav.isPathAllowed('/dashboard/irrigation', { role: 'SUPER_ADMIN' }), true);
  for (const resource of ['irrigation', 'irrigation_allocations', 'irrigation_leadership']) {
    assert.equal(nav.isPathAllowed('/dashboard/irrigation/structure/canals', grants(resource)), true);
  }
  assert.equal(nav.isPathAllowed('/dashboard/irrigation', grants('reports')), false);
  assert.equal(nav.isPathAllowed('/dashboard/irrigation/leadership/history', { role: 'ADMIN' }), false);
});

test('scheme management is on the AMCOS portal only, not the admin or farmer portals', () => {
  const user = { role: 'MAMCOS_SECRETARY', roleId: 'r', permissions: [{ resource: 'irrigation', action: 'VIEW' }] };
  assert.equal(loadNavigation('cooperatives').isPathAllowed('/dashboard/irrigation', user), true);
  assert.equal(loadNavigation('admin').isPathAllowed('/dashboard/irrigation', { ...user, role: 'ADMIN' }), false);
  assert.equal(loadNavigation('admin').isPathAllowed('/dashboard/irrigation', { role: 'SUPER_ADMIN' }), false);
  assert.equal(loadNavigation('farmers').isPathAllowed('/dashboard/irrigation', { role: 'FARMER' }), false);
});

test('the AMCOS portal does not offer the removed sections, but the admin portal still does', () => {
  const removed = ['marketplace', 'leases', 'premium-fund', 'grantor', 'projects', 'compliance', 'corrections', 'insurance', 'finance',
    'collection-centres', 'ops-field-work', 'market', 'inventory', 'field-officers', 'farms', 'memberships',
    'rice-calendar', 'users', 'field-surveys', 'crop-cycles', 'activities', 'seasons', 'weather', 'credit'].map((s) => `/dashboard/${s}`);
  const user = { role: 'SUPER_ADMIN' };
  const coop = loadNavigation('cooperatives');
  const links = coop.getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href));
  for (const href of removed) {
    assert.ok(!links.includes(href), `sidebar still lists ${href}`);
    assert.equal(coop.isPathAllowed(href, user), false, `${href} still reachable`);
  }
  assert.equal(coop.isPathAllowed('/dashboard/farms/abc', user), false);
  for (const href of ['/dashboard/farmers', '/dashboard/irrigation', '/dashboard/accounting', '/dashboard/roles']) {
    assert.equal(coop.isPathAllowed(href, user), true, href);
  }
  assert.ok(loadNavigation('admin').getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href)).includes('/dashboard/farms'));
});

test('the AMCOS sidebar is one ungrouped list, most-used pages first', () => {
  const groups = loadNavigation('cooperatives').getVisibleGroups({ role: 'SUPER_ADMIN' });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '');
  const links = groups[0].items.map((i) => i.href);
  assert.equal(links.slice(0, 3).join(), '/dashboard,/dashboard/scheme-structure,/dashboard/plot-allocation');
  assert.ok(!links.includes('/dashboard/irrigation'), 'Scheme Management has no sidebar entry any more');
  assert.ok(links.indexOf('/dashboard/ops-orders') < links.indexOf('/dashboard/accounting'));
  assert.ok(loadNavigation('admin').getVisibleGroups({ role: 'SUPER_ADMIN' }).length > 1, 'admin portal keeps its groups');
});

test('the farmer list lives inside Farmers & Plot Allocation, and stays a menu item for those without it', () => {
  const coop = loadNavigation('cooperatives');
  const hrefs = (u) => coop.getVisibleGroups(u).flatMap((g) => g.items.map((i) => i.href));
  assert.ok(!hrefs({ role: 'SUPER_ADMIN' }).includes('/dashboard/farmers'));
  const farmersOnly = { role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: [{ resource: 'farmers', action: 'VIEW' }] };
  assert.ok(hrefs(farmersOnly).includes('/dashboard/farmers'));
  assert.equal(coop.isPathAllowed('/dashboard/farmers', { role: 'SUPER_ADMIN' }), true);
  const both = { ...farmersOnly, permissions: [...farmersOnly.permissions, { resource: 'irrigation_allocations', action: 'VIEW' }] };
  assert.ok(hrefs(both).includes('/dashboard/plot-allocation') && !hrefs(both).includes('/dashboard/farmers'));
});

test('Task Management follows the machinery grant and exists only in the AMCOS portal', () => {
  const user = { role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: [{ resource: 'machinery', action: 'VIEW' }] };
  const coop = loadNavigation('cooperatives');
  assert.ok(coop.getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href)).includes('/dashboard/task-management'));
  assert.equal(coop.isPathAllowed('/dashboard/task-management', user), true);
  assert.equal(coop.isPathAllowed('/dashboard/task-management', { ...user, permissions: [] }), false);
  assert.equal(loadNavigation('admin').isPathAllowed('/dashboard/task-management', { role: 'SUPER_ADMIN' }), false);
  assert.equal(loadNavigation('farmers').isPathAllowed('/dashboard/task-management', { role: 'FARMER' }), false);
});

test('Assets follow their own grant and exist only in the AMCOS portal', () => {
  const user = { role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: [{ resource: 'assets', action: 'VIEW' }] };
  const coop = loadNavigation('cooperatives');
  assert.ok(coop.getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href)).includes('/dashboard/assets'));
  assert.equal(coop.isPathAllowed('/dashboard/assets', user), true);
  assert.equal(coop.isPathAllowed('/dashboard/assets', { ...user, permissions: [{ resource: 'machinery', action: 'VIEW' }] }), false);
  assert.equal(loadNavigation('admin').isPathAllowed('/dashboard/assets', { role: 'SUPER_ADMIN' }), false);
  assert.equal(loadNavigation('farmers').isPathAllowed('/dashboard/assets', { role: 'FARMER' }), false);
});

test('Farmer Dues follow their own grant and exist only in the AMCOS portal', () => {
  const user = { role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: [{ resource: 'dues', action: 'VIEW' }] };
  const coop = loadNavigation('cooperatives');
  assert.ok(coop.getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href)).includes('/dashboard/dues'));
  assert.equal(coop.isPathAllowed('/dashboard/dues', user), true);
  assert.equal(coop.isPathAllowed('/dashboard/dues', { ...user, permissions: [{ resource: 'assets', action: 'VIEW' }] }), false);
  assert.equal(loadNavigation('admin').isPathAllowed('/dashboard/dues', { role: 'SUPER_ADMIN' }), false);
  assert.equal(loadNavigation('farmers').isPathAllowed('/dashboard/dues', { role: 'FARMER' }), false);
});

test('Communication follows its own grant and exists only in the AMCOS portal', () => {
  const user = { role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: [{ resource: 'communication', action: 'VIEW' }] };
  const coop = loadNavigation('cooperatives');
  assert.ok(coop.getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href)).includes('/dashboard/communication'));
  assert.equal(coop.isPathAllowed('/dashboard/communication', user), true);
  assert.equal(coop.isPathAllowed('/dashboard/communication', { ...user, permissions: [{ resource: 'machinery', action: 'VIEW' }] }), false);
  assert.equal(loadNavigation('admin').isPathAllowed('/dashboard/communication', { role: 'SUPER_ADMIN' }), false);
  assert.equal(loadNavigation('farmers').isPathAllowed('/dashboard/communication', { role: 'FARMER' }), false);
});

test('Payroll follows its own grant and exists only in the AMCOS portal', () => {
  const user = { role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: [{ resource: 'payroll', action: 'VIEW' }] };
  const coop = loadNavigation('cooperatives');
  assert.ok(coop.getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href)).includes('/dashboard/payroll'));
  assert.equal(coop.isPathAllowed('/dashboard/payroll', user), true);
  assert.equal(coop.isPathAllowed('/dashboard/payroll', { ...user, permissions: [{ resource: 'assets', action: 'VIEW' }] }), false);
  assert.equal(loadNavigation('admin').isPathAllowed('/dashboard/payroll', { role: 'SUPER_ADMIN' }), false);
});

test('AMCOS Settings follows its own grant and exists only in the AMCOS portal', () => {
  const user = { role: 'CUSTOM', roleId: 'r', mamcosId: 'm1', permissions: [{ resource: 'amcos_settings', action: 'VIEW' }] };
  const coop = loadNavigation('cooperatives');
  assert.ok(coop.getVisibleGroups(user).flatMap((g) => g.items.map((i) => i.href)).includes('/dashboard/amcos-settings'));
  assert.equal(coop.isPathAllowed('/dashboard/amcos-settings', user), true);
  assert.equal(coop.isPathAllowed('/dashboard/amcos-settings', { ...user, permissions: [{ resource: 'payroll', action: 'VIEW' }] }), false);
  assert.equal(coop.isPathAllowed('/dashboard/amcos-settings/membership-levies', user), true);
  assert.equal(loadNavigation('admin').isPathAllowed('/dashboard/amcos-settings', { role: 'SUPER_ADMIN' }), false);
});
