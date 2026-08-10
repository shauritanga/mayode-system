import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

@Injectable()
export class ExportService {
  csv(rows: Record<string, unknown>[]) {
    if (!rows.length) return '';
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const value = (item: unknown) => {
      const text = item instanceof Date ? item.toISOString() : String(item ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [headers.join(','), ...rows.map((row) => headers.map((header) => value(row[header])).join(','))].join('\n');
  }

  xlsx(rows: Record<string, unknown>[], sheetName = 'Report') {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName.slice(0, 31));
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  }

  /**
   * Renders rows as a simple landscape table, wrapping to a new page when a
   * row would overflow. Column widths are shared equally — fine for the
   * short report rows this serves (farmer payments, crop cycles, etc.);
   * revisit if a report ever needs per-column sizing.
   */
  pdf(rows: Record<string, unknown>[], title = 'Report'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text(title, { align: 'left' });
      doc.moveDown(0.5);

      if (!rows.length) {
        doc.fontSize(10).text('No records.');
        doc.end();
        return;
      }

      const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colWidth = pageWidth / headers.length;
      const rowHeight = 20;
      const cell = (text: unknown) => {
        const value = text instanceof Date ? text.toISOString() : String(text ?? '');
        return value.length > 40 ? `${value.slice(0, 37)}...` : value;
      };

      const drawRow = (values: string[], y: number, bold: boolean) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        values.forEach((value, i) => {
          doc.text(value, doc.page.margins.left + i * colWidth, y, { width: colWidth - 4, ellipsis: true });
        });
      };

      let y = doc.y;
      drawRow(headers, y, true);
      y += rowHeight;

      for (const row of rows) {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          drawRow(headers, y, true);
          y += rowHeight;
        }
        drawRow(
          headers.map((h) => cell(row[h])),
          y,
          false,
        );
        y += rowHeight;
      }

      doc.end();
    });
  }
}
