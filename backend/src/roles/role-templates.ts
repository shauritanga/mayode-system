import { Prisma, PermissionAction, UserRole } from '@prisma/client';

type Db = Prisma.TransactionClient;

export interface RoleTemplate {
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
      // Sees whether a farmer has paid (never changes it) and registers plots on the Canal / Block / Plot screens.
      dues: V,
      irrigation: V,
      irrigation_allocations: VC,
      water: VC, // logs water issues found in the field
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
  {
    name: 'Cashier',
    description: 'Collects and records member payments and charges. Cannot change accounts, pay salaries or manage staff.',
    grants: { workspace: V, farmers: V, dues: VCE, accounting: V, harvest_fees: VCE, harvest_clearance: V, harvest_passes: V, cash_drawer: ['VIEW', 'CREATE'] },
  },
  {
    name: 'Accountant',
    description: 'Keeps the books: ledger, charges, assets and the monthly payroll. Cannot manage users or roles.',
    grants: {
      workspace: V, farmers: V, accounting: VCE, finance: VCE, dues: VCE, payroll: VCE, assets: VE,
      loans: VCE, suppliers: V, reports: V, audit_logs: V, irrigation_transfer_approval: ['EDIT'],
      harvest_fees: VCE, harvest_clearance: V, harvest_passes: V,
      // Verifies that arrears are cleared before a defaulted plot is re-rented.
      farm_administration: V, farm_leases: V,
      payroll_attendance: V, water: V, water_schedules: V,
      cash_drawer: ['VIEW', 'EDIT'], input_distribution: V, purchase_orders: V, maintenance_schedule: V,
      combine_harvesters: V, harvest_collections: V,
    },
  },
  {
    name: 'Manager',
    description: 'Oversees the whole AMCOS with read access to operations, finance and payroll. Gives the final sign-off on plot transfers; changes nothing else.',
    grants: {
      workspace: V, farmers: V, accounting: V, finance: V, dues: V, payroll: V, assets: V, machinery: V,
      irrigation: V, irrigation_allocations: V, irrigation_leadership: V, communication: V, governance: V,
      suppliers: V, inventory: V, warehouses: V, reports: V, audit_logs: V, irrigation_transfer_approval: ['EDIT'],
      harvest_fees: V, harvest_fee_approval: ['EDIT'], harvest_clearance: V, harvest_passes: V,
      farm_administration: V, farm_leases: V,
      payroll_approval: ['EDIT'], expense_approval: ['EDIT'], water: V, water_schedules: V,
      cash_drawer: V, input_distribution: V, purchase_orders: V, purchase_order_approval: ['EDIT'], maintenance_schedule: V,
      users: VCE, roles: VCE, combine_harvesters: VCE, harvest_collections: V,
    },
  },
  {
    name: 'Procurement Officer',
    description: 'Buys for the AMCOS: manages suppliers and stock coming in. No payments, payroll or accounts.',
    grants: {
      workspace: V, suppliers: VCE, inventory: VCE, warehouses: V, assets: VE, reports: V, payroll_attendance: VCE,
      input_distribution: VCE, purchase_orders: VCE, maintenance_schedule: VCE,
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
  source: RoleTemplate[] = ROLE_TEMPLATES,
): Promise<string[]> {
  const templates = only ? source.filter((t) => only.includes(t.name)) : source;
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
