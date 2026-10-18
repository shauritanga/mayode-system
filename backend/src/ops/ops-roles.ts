import type { PermissionAction } from '@prisma/client';

export interface OpsRoleTemplate {
  name: string;
  description: string;
  grants: Record<string, PermissionAction[]>;
}

const V: PermissionAction[] = ['VIEW'];
const VC: PermissionAction[] = ['VIEW', 'CREATE'];
const VE: PermissionAction[] = ['VIEW', 'EDIT'];
const VCE: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT'];
const ALL: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE'];

/** Records a person needs to see to pick a farmer, farm or crop season, without being able to change them. */
const LOOKUPS = { farmers: V, farms: V, plots: V, crop_cycles: V, warehouses: V, workspace: V };

/**
 * Starting roles for Mayode's commercial and farm operations. They are ordinary roles: an administrator can edit
 * them. The split is deliberate. Sales cannot confirm payments, only accounts release an order to the warehouse,
 * warehouse staff cannot bypass that, and nobody reviews their own farm work.
 */
export const OPS_ROLE_TEMPLATES: OpsRoleTemplate[] = [
  {
    name: 'Sales Officer',
    description: 'Registers customers, writes quotations and orders, and follows them. Cannot review, confirm payments or release goods.',
    grants: { ops_catalog: V, ops_customers: VCE, ops_orders: VCE, ops_stock: V, ops_reports: V, workspace: V },
  },
  {
    name: 'Accounts Officer',
    description: 'Reviews orders, issues invoices, records and confirms payments, and releases paid orders to the warehouse.',
    grants: { ops_catalog: V, ops_customers: V, ops_orders: V, ops_review: VCE, ops_payments: VCE, ops_stock: V, ops_dispatch: V, ops_reports: V, workspace: V },
  },
  {
    name: 'Warehouse Officer',
    description: 'Receives paddy, records milling, sets stock aside for released orders and records dispatches. Cannot release an unpaid order.',
    grants: { ops_catalog: V, ops_receiving: VCE, ops_processing: VC, ops_stock: V, ops_dispatch: VCE, ops_harvest: V, ops_reports: V, ...LOOKUPS },
  },
  {
    name: 'Warehouse Supervisor',
    description: 'Everything a warehouse officer does, plus stock adjustments, transfers, reversals and cancelling receipts or dispatches.',
    grants: { ops_catalog: V, ops_receiving: ALL, ops_processing: ALL, ops_stock: VCE, ops_dispatch: ALL, ops_harvest: V, ops_reports: V, ...LOOKUPS },
  },
  {
    name: 'Farm Manager',
    description: 'Plans and assigns farm work, reviews it, manages inputs and harvest records for Mayode’s farms.',
    grants: { ops_farm_tasks: VCE, ops_farm_review: VE, ops_field_work: V, ops_farm_inputs: VCE, ops_harvest: VCE, ops_reports: V, ...LOOKUPS, farms: VCE, plots: VCE, crop_cycles: VCE },
  },
  {
    name: 'Agronomist',
    description: 'Carries out and records field inspections, advises on treatment and reviews field work.',
    grants: { ops_farm_tasks: V, ops_farm_review: VE, ops_field_work: VCE, ops_farm_inputs: V, ops_harvest: V, ...LOOKUPS },
  },
  {
    name: 'Field Worker',
    description: 'Sees assigned farm tasks, checks in at the plot and reports the work. Cannot approve work.',
    grants: { ops_field_work: VCE },
  },
  {
    name: 'Management',
    description: 'Read-only view of sales, warehouse, farm and reports across departments, and approval to release an unpaid order.',
    grants: {
      ops_catalog: V, ops_customers: V, ops_orders: V, ops_review: V, ops_payments: ['VIEW', 'DELETE'], ops_receiving: V, ops_processing: V, ops_stock: V, ops_dispatch: V,
      ops_farm_tasks: V, ops_farm_review: V, ops_field_work: V, ops_farm_inputs: V, ops_harvest: V, ops_reports: V, ...LOOKUPS, reports: V,
    },
  },
];
