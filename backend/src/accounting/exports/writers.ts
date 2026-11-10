import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, Table as DocxTable, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { cellText, type Column, type ReportDocument, type Table } from './report-document';

export type ExportFormat = 'PDF' | 'DOCX' | 'XLSX';
export const FORMAT_INFO: Record<ExportFormat, { ext: string; mime: string }> = {
  PDF: { ext: 'pdf', mime: 'application/pdf' },
  DOCX: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  XLSX: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

const weights = (cols: Column[]) => {
  const w = cols.map((c) => c.width ?? (c.align === 'right' ? 1.2 : 3));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
};

// ───────────────────────── PDF ─────────────────────────
export function writePdf(doc: ReportDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: doc.heading, Author: doc.amcosName } });
    const chunks: Buffer[] = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const left = pdf.page.margins.left;
    const width = pdf.page.width - left - pdf.page.margins.right;
    const bottom = () => pdf.page.height - pdf.page.margins.bottom - 24;

    pdf.font('Helvetica-Bold').fontSize(15).text(doc.amcosName.toUpperCase(), { align: 'center' });
    pdf.moveDown(0.3).fontSize(12.5).text(doc.heading, { align: 'center' });
    pdf.font('Helvetica').fontSize(9.5).fillColor('#444').text(doc.periodLine, { align: 'center' });
    pdf.text(`Amounts in ${doc.currency}`, { align: 'center' }).fillColor('#000');
    pdf.moveDown(0.5);
    pdf.moveTo(left, pdf.y).lineTo(left + width, pdf.y).lineWidth(1).stroke('#222');
    pdf.moveDown(0.8);

    const drawHeader = (t: Table, ws: number[]) => {
      const y = pdf.y;
      pdf.rect(left, y - 2, width, 16).fill('#e8ece9').fillColor('#000');
      let x = left;
      t.columns.forEach((c, i) => {
        pdf.font('Helvetica-Bold').fontSize(8.5).text(c.label, x + 3, y + 1, { width: ws[i] * width - 6, align: c.align ?? 'left' });
        x += ws[i] * width;
      });
      pdf.y = y + 17;
    };

    for (const t of doc.tables) {
      const ws = weights(t.columns);
      if (pdf.y + 60 > bottom()) pdf.addPage();
      if (t.heading) {
        pdf.font('Helvetica-Bold').fontSize(10.5).text(t.heading, left, pdf.y, { width });
        pdf.moveDown(0.3);
      }
      drawHeader(t, ws);
      for (const row of t.rows) {
        const style = row.style ?? 'normal';
        const font = style === 'normal' ? 'Helvetica' : 'Helvetica-Bold';
        pdf.font(font).fontSize(8.5);
        const texts = t.columns.map((c, i) => cellText(row.cells[i] ?? '', c));
        const h = Math.max(...texts.map((s, i) => pdf.heightOfString(s || ' ', { width: ws[i] * width - 6 }))) + 5;
        if (pdf.y + h > bottom()) { pdf.addPage(); drawHeader(t, ws); }
        const y = pdf.y;
        if (style === 'heading') pdf.rect(left, y - 1, width, h).fill('#f4f6f5').fillColor('#000');
        let x = left;
        texts.forEach((s, i) => {
          pdf.font(font).fontSize(8.5).text(s, x + 3, y + 1.5, { width: ws[i] * width - 6, align: t.columns[i].align ?? 'left' });
          x += ws[i] * width;
        });
        if (style === 'subtotal' || style === 'total') {
          pdf.moveTo(left, y - 1).lineTo(left + width, y - 1).lineWidth(0.5).stroke('#555');
          if (style === 'total') pdf.moveTo(left, y + h - 1).lineTo(left + width, y + h - 1).lineWidth(1.2).stroke('#000');
        }
        pdf.y = y + h;
      }
      if (t.note) pdf.font('Helvetica-Oblique').fontSize(8).fillColor('#555').text(t.note, left, pdf.y + 3, { width }).fillColor('#000');
      pdf.moveDown(1);
    }

    if (doc.notes.length) {
      if (pdf.y + 50 > bottom()) pdf.addPage();
      pdf.font('Helvetica-Bold').fontSize(9).text('Notes', left, pdf.y);
      doc.notes.forEach((n, i) => pdf.font('Helvetica').fontSize(8.5).text(`${i + 1}. ${n}`, left, pdf.y + 2, { width }));
      pdf.moveDown(1);
    }

    if (pdf.y + 90 > bottom()) pdf.addPage();
    pdf.moveDown(1.2);
    const colW = width / 2 - 10;
    const sy = pdf.y;
    pdf.font('Helvetica').fontSize(9);
    pdf.text(`Prepared by: ${doc.preparedBy}`, left, sy, { width: colW });
    pdf.moveTo(left, sy + 38).lineTo(left + colW, sy + 38).lineWidth(0.6).stroke('#000');
    pdf.text('Signature / Date', left, sy + 41, { width: colW });
    const rx = left + colW + 20;
    pdf.text(`Approved by: ${doc.approvedBy ?? '______________________________'}`, rx, sy, { width: colW });
    pdf.moveTo(rx, sy + 38).lineTo(rx + colW, sy + 38).lineWidth(0.6).stroke('#000');
    pdf.text('Signature / Date', rx, sy + 41, { width: colW });

    const range = pdf.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      pdf.switchToPage(range.start + i);
      pdf.page.margins.bottom = 0; // the footer sits in the bottom margin; without this pdfkit would add a blank page for it
      pdf.font('Helvetica').fontSize(7.5).fillColor('#666');
      pdf.text(`${doc.amcosName} · ${doc.kind} · Generated ${doc.generatedAt}`, left, pdf.page.height - 34, { width: width - 70, lineBreak: false });
      pdf.text(`Page ${i + 1} of ${range.count}`, left + width - 70, pdf.page.height - 34, { width: 70, align: 'right', lineBreak: false });
    }
    pdf.end();
  });
}

// ───────────────────────── Word ─────────────────────────
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const LINE = { style: BorderStyle.SINGLE, size: 4, color: '555555' };
const DOUBLE = { style: BorderStyle.DOUBLE, size: 6, color: '000000' };

export async function writeDocx(doc: ReportDocument): Promise<Buffer> {
  const centered = (text: string, o: { size?: number; bold?: boolean; color?: string; after?: number } = {}) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: o.after ?? 40 }, children: [new TextRun({ text, bold: o.bold, size: o.size ?? 20, color: o.color })] });

  const children: (Paragraph | DocxTable)[] = [
    centered(doc.amcosName.toUpperCase(), { size: 30, bold: true }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: doc.heading, bold: true, size: 25, color: '000000' })] }),
    centered(doc.periodLine, { size: 19, color: '444444', after: 0 }),
    centered(`Amounts in ${doc.currency}`, { size: 19, color: '444444', after: 200 }),
  ];

  for (const t of doc.tables) {
    if (t.heading) children.push(new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: t.heading, bold: true, size: 22 })] }));
    const ws = weights(t.columns);
    const total = 9900; // twips across an A4 page with 0.7" margins
    const mk = (text: string, i: number, o: { bold?: boolean; fill?: string; top?: any; bottom?: any }) =>
      new TableCell({
        width: { size: Math.round(ws[i] * total), type: WidthType.DXA },
        shading: o.fill ? { fill: o.fill, color: 'auto' } : undefined,
        borders: { top: o.top ?? NONE, bottom: o.bottom ?? NONE, left: NONE, right: NONE },
        margins: { top: 30, bottom: 30, left: 60, right: 60 },
        children: [new Paragraph({ alignment: t.columns[i].align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: o.bold, size: 17 })] })],
      });
    const rows = [
      new TableRow({ tableHeader: true, children: t.columns.map((c, i) => mk(c.label, i, { bold: true, fill: 'E8ECE9', bottom: LINE })) }),
      ...t.rows.map((r) => {
        const style = r.style ?? 'normal';
        return new TableRow({
          cantSplit: true,
          children: t.columns.map((c, i) => mk(cellText(r.cells[i] ?? '', c), i, {
            bold: style !== 'normal',
            fill: style === 'heading' ? 'F4F6F5' : undefined,
            top: style === 'subtotal' || style === 'total' ? LINE : undefined,
            bottom: style === 'total' ? DOUBLE : undefined,
          })),
        });
      }),
    ];
    children.push(new DocxTable({ width: { size: total, type: WidthType.DXA }, columnWidths: ws.map((w) => Math.round(w * total)), rows }));
    if (t.note) children.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: t.note, italics: true, size: 16, color: '555555' })] }));
  }

  if (doc.notes.length) {
    children.push(new Paragraph({ spacing: { before: 240, after: 60 }, children: [new TextRun({ text: 'Notes', bold: true, size: 19 })] }));
    doc.notes.forEach((n, i) => children.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${n}`, size: 17 })] })));
  }

  const sign = (label: string, name: string) => new TableCell({
    width: { size: 4950, type: WidthType.DXA },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
    children: [
      new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: `${label}: ${name}`, size: 18 })] }),
      new Paragraph({ spacing: { before: 500 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 2 } }, children: [new TextRun({ text: 'Signature / Date', size: 16 })] }),
    ],
  });
  children.push(new DocxTable({
    width: { size: 9900, type: WidthType.DXA }, columnWidths: [4950, 4950],
    rows: [new TableRow({ children: [sign('Prepared by', doc.preparedBy), sign('Approved by', doc.approvedBy ?? '______________________')] })],
  }));

  const file = new Document({
    creator: doc.amcosName, title: doc.heading,
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${doc.amcosName} · ${doc.kind} · Generated ${doc.generatedAt} · Page `, size: 15, color: '666666' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 15, color: '666666' }),
              new TextRun({ text: ' of ', size: 15, color: '666666' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: '666666' }),
            ],
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBuffer(file);
}

// ───────────────────────── Excel ─────────────────────────
export function writeXlsx(doc: ReportDocument): Buffer {
  const aoa: (string | number | null)[][] = [[doc.amcosName.toUpperCase()], [doc.heading], [doc.periodLine], [`Amounts in ${doc.currency}`], []];
  const moneyCells: { r: number; c: number }[] = [];
  const maxCols = Math.max(...doc.tables.map((t) => t.columns.length), 3);
  for (const t of doc.tables) {
    if (t.heading) aoa.push([t.heading]);
    aoa.push(t.columns.map((c) => c.label));
    for (const r of t.rows) {
      const line = t.columns.map((c, i) => r.cells[i] ?? null);
      line.forEach((v, i) => { if (typeof v === 'number' && t.columns[i].money !== false) moneyCells.push({ r: aoa.length, c: i }); });
      aoa.push(line);
    }
    if (t.note) aoa.push([t.note]);
    aoa.push([]);
  }
  if (doc.notes.length) { aoa.push(['Notes']); doc.notes.forEach((n, i) => aoa.push([`${i + 1}. ${n}`])); aoa.push([]); }
  aoa.push([`Prepared by: ${doc.preparedBy}`], [`Approved by: ${doc.approvedBy ?? '______________________'}`], [`Generated ${doc.generatedAt}`]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const { r, c } of moneyCells) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (ws[ref]) ws[ref].z = '#,##0.00;(#,##0.00);"-"';
  }
  const widest = doc.tables.find((t) => t.columns.length === maxCols) ?? doc.tables[0];
  ws['!cols'] = Array.from({ length: maxCols }, (_, i) => ({ wch: widest?.columns[i]?.align === 'right' ? 18 : i === 0 && maxCols > 3 ? 14 : 44 }));
  ws['!merges'] = [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: maxCols - 1 } }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, doc.kind.replace(/[\\/?*[\]:]/g, '').slice(0, 31));
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

export async function render(format: ExportFormat, doc: ReportDocument): Promise<Buffer> {
  if (format === 'PDF') return writePdf(doc);
  if (format === 'DOCX') return writeDocx(doc);
  return writeXlsx(doc);
}
