import type { PrismaService } from '../../prisma/prisma.service';
import type { ReportDocument } from './report-document';
import { FORMAT_INFO, render, type ExportFormat } from './writers';

/** The East Africa date (YYYY-MM-DD) of an instant. */
export const eatDate = (d: Date | string) => new Date(new Date(d).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
export const todayEat = () => eatDate(new Date());
const stamp = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) + ' EAT';

/** What every downloaded list carries above its table: the cooperative, who prepared it and when. */
export async function listHeader(prisma: PrismaService, mamcosId: string | null | undefined, userId: string): Promise<Omit<ReportDocument, 'kind' | 'heading' | 'periodLine' | 'tables'>> {
  const [mamcos, me] = await Promise.all([
    mamcosId ? prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true } }) : null,
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, phone: true } }),
  ]);
  return {
    amcosName: mamcos?.name ?? (mamcosId === undefined ? 'All cooperatives' : 'Mayode platform'),
    currency: 'Tanzanian Shillings (TZS)', notes: [],
    preparedBy: [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.phone || 'Office', approvedBy: null, generatedAt: stamp(),
  };
}

/** Draws the document in the chosen format and names the file. */
export async function listFile(format: ExportFormat, doc: ReportDocument, slug: string) {
  const info = FORMAT_INFO[format];
  return { buffer: await render(format, doc), fileName: `${slug}-${todayEat()}.${info.ext}`, mime: info.mime, heading: doc.heading, rows: Math.max(doc.tables[0]?.rows.length ?? 0, 0) };
}
