import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { REPORT_KINDS } from '../exports/report-titles';

export class GenerateReportDto {
  @ApiProperty({ enum: REPORT_KINDS }) @IsIn(REPORT_KINDS) report!: string;
  @ApiProperty({ enum: ['PDF', 'DOCX', 'XLSX'] }) @IsIn(['PDF', 'DOCX', 'XLSX']) format!: 'PDF' | 'DOCX' | 'XLSX';
  @ApiPropertyOptional({ description: 'Custom range start, YYYY-MM-DD' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional({ description: 'Custom range end (or the "as at" date), YYYY-MM-DD' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @ApiPropertyOptional({ description: 'Financial year, e.g. 2026; with `month` it is that month of that year' }) @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) month?: number;
  @ApiPropertyOptional({ description: 'Name of the approver, printed on the statement; left as a signature line when empty' }) @IsOptional() @IsString() @MaxLength(120) approvedBy?: string;
}

export class ListReportArchiveDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(REPORT_KINDS) report?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['PDF', 'DOCX', 'XLSX']) format?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class ListExportQueryDto {
  @ApiProperty({ enum: ['journal', 'trial-balance', 'general-ledger', 'cashbook', 'expenses', 'income', 'invoices', 'bills', 'farmers-owed', 'budgets'] })
  @IsIn(['journal', 'trial-balance', 'general-ledger', 'cashbook', 'expenses', 'income', 'invoices', 'bills', 'farmers-owed', 'budgets']) view!: 'journal' | 'trial-balance' | 'general-ledger' | 'cashbook' | 'expenses' | 'income' | 'invoices' | 'bills' | 'farmers-owed' | 'budgets';
  @ApiProperty({ enum: ['PDF', 'DOCX', 'XLSX'] }) @IsIn(['PDF', 'DOCX', 'XLSX']) format!: 'PDF' | 'DOCX' | 'XLSX';
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional({ description: 'Invoices and bills: unpaid, PAID or VOID' }) @IsOptional() @IsString() @MaxLength(20) status?: string;
  @ApiPropertyOptional({ description: 'Cashbook: a money account id, or "unassigned"' }) @IsOptional() @IsString() @MaxLength(64) account?: string;
  @ApiPropertyOptional({ description: 'Journal: only entries from this origin' }) @IsOptional() @IsString() @MaxLength(40) sourceType?: string;
  @ApiPropertyOptional({ description: 'Cashbook: MOBILE_MONEY for the wallets book' }) @IsOptional() @IsIn(['CASH', 'BANK', 'MOBILE_MONEY']) kind?: string;
}
