import { createRoleTemplates, ROLE_TEMPLATES } from './role-templates';

function db(existing: string[] = []) {
  const created: { name: string; mamcosId: string | null }[] = [];
  const grants: { roleId: string; resourceId: string; action: string }[] = [];
  const keys = [
    ...new Set(ROLE_TEMPLATES.flatMap((t) => Object.keys(t.grants))),
  ];
  const tx: any = {
    resource: {
      findMany: jest
        .fn()
        .mockResolvedValue(keys.map((k) => ({ id: `res-${k}`, key: k }))),
    },
    role: {
      findFirst: jest.fn(async ({ where }) =>
        existing.includes(where.name) ? { id: 'x' } : null,
      ),
      create: jest.fn(async ({ data }) => {
        created.push({ name: data.name, mamcosId: data.mamcosId });
        return { id: `role-${data.name}` };
      }),
    },
    rolePermission: {
      createMany: jest.fn(async ({ data }) => {
        grants.push(...data);
      }),
    },
  };
  return { tx, created, grants };
}

describe('Sale workflow role templates', () => {
  it('creates every template in the given cooperative as an ordinary, editable role', async () => {
    const { tx, created } = db();
    const names = await createRoleTemplates(tx, 'm1');
    expect(names).toEqual([
      'Field Officer',
      'Salesperson',
      'Warehouse Keeper',
      'Sales Manager',
      'Sales Auditor',
    ]);
    expect(created.every((c) => c.mamcosId === 'm1')).toBe(true);
    // never marked as system roles, so the owner can edit or delete them
    expect(
      tx.role.create.mock.calls.every(
        ([arg]: any) => arg.data.isSystem === undefined,
      ),
    ).toBe(true);
  });

  it('never overwrites a role that already exists', async () => {
    const { tx } = db(['Salesperson']);
    expect(await createRoleTemplates(tx, null)).not.toContain('Salesperson');
  });

  it('keeps the duties separate: only the manager can approve, only the keeper can release', async () => {
    const { grants } = db();
    const { tx, grants: g } = db();
    await createRoleTemplates(tx, 'm1');
    const can = (role: string, resource: string, action: string) =>
      g.some(
        (x) =>
          x.roleId === `role-${role}` &&
          x.resourceId === `res-${resource}` &&
          x.action === action,
      );
    expect(grants).toEqual([]);
    expect(can('Sales Manager', 'release_approvals', 'EDIT')).toBe(true);
    for (const r of ['Salesperson', 'Warehouse Keeper', 'Sales Auditor'])
      expect(can(r, 'release_approvals', 'EDIT')).toBe(false);
    expect(can('Warehouse Keeper', 'warehouse_desk', 'EDIT')).toBe(true);
    expect(can('Salesperson', 'warehouse_desk', 'EDIT')).toBe(false);
    expect(can('Salesperson', 'sale_orders', 'CREATE')).toBe(true);
    expect(can('Warehouse Keeper', 'sale_orders', 'CREATE')).toBe(false);
    for (const r of [
      'Salesperson',
      'Warehouse Keeper',
      'Sales Manager',
      'Sales Auditor',
    ]) {
      expect(
        g.some((x) => x.roleId === `role-${r}` && x.action === 'DELETE'),
      ).toBe(false);
    }
    expect(['VIEW'].every((a) => can('Sales Auditor', 'audit_logs', a))).toBe(
      true,
    );
    expect(
      g
        .filter((x) => x.roleId === 'role-Sales Auditor')
        .every((x) => x.action === 'VIEW'),
    ).toBe(true);
  });

  it('can create just the Field Officer role, which never includes finance, sales or user management', async () => {
    const { tx, created, grants } = db();
    expect(await createRoleTemplates(tx, 'm1', ['Field Officer'])).toEqual(['Field Officer']);
    expect(created).toHaveLength(1);
    const keys = new Set(grants.map((g) => g.resourceId.replace('res-', '')));
    for (const forbidden of ['finance', 'sales', 'users', 'roles', 'settings', 'accounting', 'loans']) {
      expect(keys.has(forbidden)).toBe(false);
    }
    expect(keys.has('farmers')).toBe(true);
  });
});
