import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { Actor, assertVisible } from './ops-common';
import { lineKg } from './sales-ops.service';

const money = (n: number) => `TZS ${Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString('en-US') : (Math.round(n * 100) / 100).toLocaleString('en-US')}`;
const dt = (d?: Date | null) => (d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' }) : '—');
const dOnly = (d?: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' }) : '—');

type Col = { label: string; width: number; align?: 'left' | 'right' };

/** Documents are drawn from the saved records every time, never typed again by hand. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async render(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      draw(doc);
      doc.end();
    });
  }

  private header(doc: PDFKit.PDFDocument, org: { orgName: string; address?: string | null; contactPhone?: string | null; contactEmail?: string | null }, title: string, number: string) {
    doc.font('Helvetica-Bold').fontSize(16).text(org.orgName, 40, 40);
    doc.font('Helvetica').fontSize(9).fillColor('#444').text([org.address, org.contactPhone, org.contactEmail].filter(Boolean).join('  ·  '), 40, doc.y);
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(18).text(title, 40, 40, { align: 'right', width: 515 });
    doc.font('Helvetica').fontSize(10).text(number, 40, doc.y, { align: 'right', width: 515 });
    doc.moveTo(40, 92).lineTo(555, 92).strokeColor('#999').stroke().strokeColor('#000');
    doc.y = 104;
  }

  private kv(doc: PDFKit.PDFDocument, x: number, y: number, width: number, rows: [string, string][]) {
    let cy = y;
    for (const [k, v] of rows) {
      doc.font('Helvetica').fontSize(8).fillColor('#666').text(k.toUpperCase(), x, cy, { width });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(v || '—', x, doc.y, { width });
      cy = doc.y + 4;
    }
    return cy;
  }

  private table(doc: PDFKit.PDFDocument, cols: Col[], rows: string[][]) {
    const x0 = 40;
    const draw = (cells: string[], bold: boolean) => {
      let x = x0;
      const y = doc.y;
      let h = 14;
      cells.forEach((c, i) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(c, x + 3, y + 3, { width: cols[i].width - 6, align: cols[i].align ?? 'left' });
        h = Math.max(h, doc.y - y + 3);
        x += cols[i].width;
      });
      doc.moveTo(x0, y + h).lineTo(x0 + cols.reduce((t, c) => t + c.width, 0), y + h).strokeColor('#ddd').stroke().strokeColor('#000');
      doc.y = y + h;
    };
    draw(cols.map((c) => c.label), true);
    for (const r of rows) {
      if (doc.y > 740) { doc.addPage(); doc.y = 40; draw(cols.map((c) => c.label), true); }
      draw(r, false);
    }
  }

  async invoicePdf(id: string, actor: Actor): Promise<{ pdf: Buffer; name: string }> {
    const i = await this.prisma.opsInvoice.findUnique({ where: { id }, include: { lines: true, order: { select: { reference: true } }, payments: { where: { status: 'CONFIRMED' } } } });
    assertVisible(actor, i, 'Invoice');
    const org = await this.settings.getOrgSettings();
    const c = i.customerDetails as Record<string, string | null>;
    const pdf = await this.render((doc) => {
      this.header(doc, org, 'INVOICE', i.invoiceNumber);
      const top = doc.y;
      const left = this.kv(doc, 40, top, 250, [['Bill to', i.customerName], ['Customer reference', c.reference ?? ''], ['Phone', c.phone ?? ''], ['Address', c.address ?? ''], ...(c.tin ? ([['TIN', c.tin]] as [string, string][]) : []), ...(c.vrn ? ([['VRN', c.vrn]] as [string, string][]) : [])]);
      const right = this.kv(doc, 330, top, 225, [['Invoice date', dOnly(i.invoiceDate)], ['Due date', dOnly(i.dueDate)], ['Order', i.order.reference], ['Status', i.status.replace(/_/g, ' ')], ...(i.controlNumber ? ([['Control number', i.controlNumber]] as [string, string][]) : [])]);
      doc.y = Math.max(left, right) + 10;
      this.table(doc, [{ label: 'Description', width: 175 }, { label: 'Qty', width: 55, align: 'right' }, { label: 'Unit price', width: 80, align: 'right' }, { label: 'Disc %', width: 45, align: 'right' }, { label: 'Tax %', width: 45, align: 'right' }, { label: 'Amount', width: 115, align: 'right' }],
        i.lines.map((l) => [`${l.description}${l.brand ? ` (${l.brand})` : ''}`, `${l.quantity} ${l.unit}`, money(l.unitPrice), String(l.discountPercent), String(l.taxRatePercent), money(l.lineTotal)]));
      doc.moveDown(0.8);
      const t = (label: string, v: string, bold = false) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(label, 340, doc.y, { width: 100, continued: true }).text(v, { width: 115, align: 'right' }); };
      t('Subtotal', money(i.subtotal)); t('Discount', `- ${money(i.discountTotal)}`); t('Tax', money(i.taxTotal)); t('Total', money(i.total), true);
      t('Paid', money(i.amountPaid)); t('Balance due', money(i.total - i.amountPaid), true);
      doc.moveDown(1.2);
      doc.font('Helvetica-Bold').fontSize(10).text('Payment instructions', 40, doc.y);
      doc.font('Helvetica').fontSize(9).text(i.paymentInstructions || (i.controlNumber ? `Pay using control number ${i.controlNumber}.` : 'Pay as agreed with your sales officer and quote the invoice number.'), 40, doc.y, { width: 515 });
    });
    return { pdf, name: `${i.invoiceNumber}.pdf` };
  }

  private async releaseNoteData(where: { id?: string; shareToken?: string }) {
    const d = await this.prisma.opsDispatch.findFirst({
      where,
      include: {
        order: { include: { customer: true } },
        warehouse: { select: { name: true, location: true } },
        lines: { include: { batch: { select: { reference: true } }, orderLine: { include: { product: { select: { name: true, brand: true, unit: true, packSizeKg: true } } } } } },
      },
    });
    return d;
  }

  private async drawReleaseNote(d: NonNullable<Awaited<ReturnType<DocumentsService['releaseNoteData']>>>): Promise<Buffer> {
    const org = await this.settings.getOrgSettings();
    const officer = await this.prisma.user.findUnique({ where: { id: d.releasingOfficerId }, select: { firstName: true, lastName: true } });
    const officerName = officer ? `${officer.firstName ?? ''} ${officer.lastName ?? ''}`.trim() : '';
    return this.render((doc) => {
      this.header(doc, org, 'GOODS RELEASE NOTE', d.releaseNoteNumber ?? d.reference);
      const top = doc.y;
      const c = d.order.customer;
      const left = this.kv(doc, 40, top, 250, [['Customer', c.name], ['Customer reference', c.reference], ['Phone', c.phone], ['Delivery / collection', d.destination ?? d.order.deliveryNote ?? '']]);
      const right = this.kv(doc, 330, top, 225, [['Order', d.order.reference], ['Dispatch', d.reference], ['Released', d.status === 'RELEASED' ? dt(d.releasedAt) : `Prepared for ${dt(d.dispatchAt)} — NOT YET RELEASED`], ['Warehouse', d.warehouse.name]]);
      doc.y = Math.max(left, right) + 6;
      this.kv(doc, 40, doc.y, 250, [['Vehicle', d.vehiclePlate], ['Driver', `${d.driverName}${d.driverPhone ? ` · ${d.driverPhone}` : ''}`], ['Transporter', d.transporter ?? '']]);
      doc.y = doc.y + 6;
      this.table(doc, [{ label: 'Product', width: 195 }, { label: 'Batch', width: 100 }, { label: 'Packages', width: 60, align: 'right' }, { label: 'Quantity (kg)', width: 160, align: 'right' }],
        d.lines.map((l) => [`${l.orderLine.product.name}${l.orderLine.product.brand ? ` (${l.orderLine.product.brand})` : ''}`, l.batch.reference, l.packages ? String(l.packages) : '—', `${l.quantityKg.toLocaleString('en-US')}`]));
      doc.moveDown(0.6);
      const total = d.lines.reduce((t, l) => t + l.quantityKg, 0);
      doc.font('Helvetica-Bold').fontSize(10).text(`Total loaded: ${total.toLocaleString('en-US')} kg`, 40, doc.y);
      void lineKg;
      if (d.notes) { doc.moveDown(0.4); doc.font('Helvetica').fontSize(9).text(`Notes: ${d.notes}`, 40, doc.y, { width: 515 }); }
      doc.moveDown(2);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9);
      doc.text('Released by', 40, y); doc.moveTo(40, y + 36).lineTo(220, y + 36).stroke(); doc.text(officerName, 40, y + 40);
      doc.text('Warehouse supervisor', 220, y); doc.moveTo(240, y + 36).lineTo(400, y + 36).stroke(); doc.text(d.supervisorName ?? '', 240, y + 40);
      doc.text('Received by (name, signature, date)', 400, y, { width: 155 }); doc.moveTo(400, y + 36).lineTo(555, y + 36).stroke();
    });
  }

  async releaseNotePdf(dispatchId: string, actor: Actor): Promise<{ pdf: Buffer; name: string }> {
    const d = await this.releaseNoteData({ id: dispatchId });
    assertVisible(actor, d, 'Dispatch');
    return { pdf: await this.drawReleaseNote(d), name: `${d.releaseNoteNumber ?? d.reference}.pdf` };
  }

  /** The link given to the customer. The long random token is the only credential, and only released notes can be opened. */
  async publicReleaseNotePdf(token: string): Promise<{ pdf: Buffer; name: string }> {
    if (!/^[a-f0-9]{48}$/.test(token)) throw new NotFoundException('Document not found');
    const d = await this.releaseNoteData({ shareToken: token });
    if (!d || d.status !== 'RELEASED') throw new NotFoundException('Document not found');
    return { pdf: await this.drawReleaseNote(d), name: `${d.releaseNoteNumber ?? d.reference}.pdf` };
  }
}
