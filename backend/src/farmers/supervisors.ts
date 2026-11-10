import { isPlaceholderPhone, normalizeMsisdn } from '../messaging/sms.service';

type Db = {
  farmer: { findUnique: (args: any) => Promise<any> };
  irrigationHectareGuardian: { findMany: (args: any) => Promise<any[]> };
};

export interface SupervisorContact {
  name: string;
  phone: string;
  kind: 'member' | 'manual';
  farmerId: string | null;
}

/**
 * Who answers for a farmer: the members named as guardian of the hectares they hold, and a supervisor who is not a member
 * (name and phone kept on the farmer). Only people who can actually be texted are returned, each number once.
 */
export async function supervisorsOfFarmer(db: Db, farmerId: string): Promise<SupervisorContact[]> {
  const farmer = await db.farmer.findUnique({ where: { id: farmerId }, select: { supervisorName: true, supervisorPhone: true } });
  const out: SupervisorContact[] = [];
  const seen = new Set<string>();
  const add = (c: SupervisorContact) => {
    const phone = normalizeMsisdn(c.phone);
    if (!c.phone || isPlaceholderPhone(phone) || seen.has(phone)) return;
    seen.add(phone);
    out.push({ ...c, phone });
  };
  const guardians = await db.irrigationHectareGuardian.findMany({
    where: { endedOn: null, allocation: { farmerId, status: 'ACTIVE' } },
    select: { guardian: { select: { id: true, firstName: true, lastName: true, user: { select: { phone: true } } } } },
  });
  for (const g of guardians) add({ name: `${g.guardian.firstName} ${g.guardian.lastName}`.trim(), phone: g.guardian.user?.phone ?? '', kind: 'member', farmerId: g.guardian.id });
  if (farmer?.supervisorPhone) add({ name: farmer.supervisorName ?? 'Supervisor', phone: farmer.supervisorPhone, kind: 'manual', farmerId: null });
  return out;
}
