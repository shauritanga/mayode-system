export interface OfficerRow {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  isActive: boolean;
  cooperative: string | null;
  region: string | null;
  district: string | null;
  assignedArea: string | null;
  farmersAssigned: number;
  farmsAssigned: number;
  farmersRegistered: number;
  farmsMapped: number;
  visitsCompleted: number;
  lastVisitAt: string | null;
  cropRecordsUpdated: number;
  dataCompleteness: number | null;
  pendingTasks: number;
  pendingBreakdown: { farmerVerifications: number; farmVerifications: number; overdueVisits: number };
  lastSyncAt: string | null;
  lastLoginAt: string | null;
}

/** The five measures officers can be ranked on. */
export const RANK_MEASURES: { key: string; label: string; value: (o: OfficerRow) => number; format?: (n: number) => string }[] = [
  { key: 'farmers', label: 'Farmers registered', value: (o) => o.farmersRegistered },
  { key: 'farms', label: 'Farms mapped', value: (o) => o.farmsMapped },
  { key: 'visits', label: 'Field visits completed', value: (o) => o.visitsCompleted },
  { key: 'completeness', label: 'Data completeness', value: (o) => o.dataCompleteness ?? -1, format: (n) => (n < 0 ? '—' : `${n}%`) },
  { key: 'crops', label: 'Crop records updated', value: (o) => o.cropRecordsUpdated },
];

export const officerName = (o: Pick<OfficerRow, 'firstName' | 'lastName'>) => `${o.firstName} ${o.lastName}`;

/** "5 min ago", "3 days ago"; null when it has never happened. */
export function ago(iso?: string | null) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Sync freshness: green within a day, amber within three, red after that or never. */
export function syncTone(iso?: string | null): 'green' | 'gold' | 'red' {
  if (!iso) return 'red';
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  return hours <= 24 ? 'green' : hours <= 72 ? 'gold' : 'red';
}
