import { Prisma, PermissionAction, UserRole } from '@prisma/client';

type Db = Prisma.TransactionClient;

interface RoleTemplate {
  name: string;
  description: string;
  grants: Record<string, PermissionAction[]>;
}

const V: PermissionAction[] = ['VIEW'];
const VC: PermissionAction[] = ['VIEW', 'CREATE'];
const VE: PermissionAction[] = ['VIEW', 'EDIT'];
const VCE: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT'];

/**
 * Starting roles for the sale workflow. They are ordinary, editable roles (not system roles):
 * the owner of the cooperative (or the platform) may change their permissions or delete
 * them, as long as no staff member is still assigned to the role.
 */
export const FIELD_OFFICER_ROLE = 'Field Officer';

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: FIELD_OFFICER_ROLE,
    description:
      'Registers and verifies farmers and farms, records crop activities and visits. No finance, sales, users or settings.',
    grants: {
      workspace: V,
      farmers: VCE,
      farms: VCE,
      plots: VCE,
      crop_cycles: VCE,
      activities: VCE,
      farm_verifications: VCE,
      field_surveys: VCE,
      farm_reports: VC,
      farm_corrections: VC,
      farm_alerts: V,
      rice_protocols: V,
      weather: V,
    },
  },
  {
    name: 'Salesperson',
    description:
      'Finds buyers and reserves stock; cannot release stock or approve credit.',
    grants: {
      sale_orders: VCE,
      buyers: VCE,
      buyer_orders: VC,
      warehouses: V,
      inventory: V,
      sales: V,
    },
  },
  {
    name: 'Warehouse Keeper',
    description:
      'Receives harvest, confirms and releases sales against the buyer’s reference, and arranges transport.',
    grants: {
      warehouse_desk: VE,
      warehouses: V,
      sale_orders: V,
      inventory: VCE,
      buyers: V,
      // Recording a delivery means choosing the source crop cycle and checking its readiness.
      crop_cycles: V,
      rice_protocols: V,
    },
  },
  {
    name: 'Sales Manager',
    description: 'Oversees sales and approves credit terms or unpaid releases.',
    grants: {
      sale_orders: VE,
      release_approvals: VE,
      sales: VE,
      buyers: VCE,
      buyer_orders: VCE,
      warehouses: V,
      inventory: V,
      audit_logs: V,
      reports: V,
    },
  },
  {
    name: 'Sales Auditor',
    description: 'Read-only view of sales, stock and the audit log.',
    grants: {
      sale_orders: V,
      sales: V,
      warehouses: V,
      inventory: V,
      buyers: V,
      audit_logs: V,
      finance: V,
      reports: V,
    },
  },
];

/**
 * Creates the sale-workflow roles for one scope (a cooperative, or the platform when
 * `mamcosId` is null). Roles that already exist by name are left untouched, so running this
 * again never overwrites changes the owner has made. Returns the names it created.
 */
export async function createRoleTemplates(
  db: Db,
  mamcosId: string | null,
  only?: string[],
): Promise<string[]> {
  const templates = only ? ROLE_TEMPLATES.filter((t) => only.includes(t.name)) : ROLE_TEMPLATES;
  const keys = [
    ...new Set(templates.flatMap((t) => Object.keys(t.grants))),
  ];
  const resources = await db.resource.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true },
  });
  const idByKey = new Map(resources.map((r) => [r.key, r.id]));
  const created: string[] = [];
  for (const template of templates) {
    const existing = await db.role.findFirst({
      where: { name: template.name, mamcosId },
      select: { id: true },
    });
    if (existing) continue;
    const role = await db.role.create({
      data: {
        name: template.name,
        description: template.description,
        systemRole: UserRole.CUSTOM,
        mamcosId,
      },
    });
    await db.rolePermission.createMany({
      data: Object.entries(template.grants).flatMap(([key, actions]) =>
        idByKey.has(key)
          ? actions.map((action) => ({
              roleId: role.id,
              resourceId: idByKey.get(key)!,
              action,
            }))
          : [],
      ),
    });
    created.push(template.name);
  }
  return created;
}
