export interface WxDay { date: string; maxTempC: number | null; minTempC: number | null; precipitationMm: number | null }
export interface WxAlert {
  id: string; alertType: string; severity: string; title: string; message: string; titleSw: string | null; messageSw: string | null;
  region: string | null; district: string | null; ward: string | null; status: string; source: string; mamcosId: string | null;
  validFrom: string; validUntil: string | null; sentAt: string | null; createdAt: string;
  smsSentCount: number; appSentCount: number; whatsappSentCount: number; officersNotified: number;
  evidence: { totalMm: number; next3Mm: number; maxDayMm: number; maxDryRun: number; wetDays: number; maxTempC: number | null; farms: number } | null;
}
export const ALERT_TYPES: [string, string][] = [
  ['FLOOD', 'Flood'], ['DROUGHT', 'Drought'], ['PEST', 'Pest'], ['DISEASE', 'Disease'],
  ['PLANTING_RECOMMENDATION', 'Planting recommendation'], ['IRRIGATION_RECOMMENDATION', 'Irrigation recommendation'], ['GENERAL', 'General'],
];
export const typeLabel = (v: string) => ALERT_TYPES.find(([k]) => k === v)?.[1] ?? v.replace(/_/g, ' ');
export const SEVERITY_BADGE: Record<string, string> = { LOW: 'badge-blue', MEDIUM: 'badge-gold', HIGH: 'badge-red', CRITICAL: 'badge-red' };
export const placeOf = (a: { ward?: string | null; district?: string | null; region?: string | null }) =>
  [a.ward, a.district, a.region].filter(Boolean).join(', ') || 'All areas';
export const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
