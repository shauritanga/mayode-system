import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

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
}
