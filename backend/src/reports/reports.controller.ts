import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ExportService } from '../common/export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePremiumFundEntryDto, ReportFormatDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ExportService,
  ) {}

  private async send(
    rows: Record<string, unknown>[],
    name: string,
    format: ReportFormatDto['format'],
    response: Response,
  ) {
    if (!format || format === 'json') return rows;
    if (format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${name}.csv"`,
      );
      return response.send(this.exporter.csv(rows));
    }
    if (format === 'pdf') {
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${name}.pdf"`,
      );
      return response.send(await this.exporter.pdf(rows, name));
    }
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${name}.xlsx"`,
    );
    return response.send(this.exporter.xlsx(rows, name));
  }

  @Get('farmer-payments')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  async farmerPayments(
    @Query() query: ReportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      await this.reports.farmerPayments(query),
      'farmer-payments',
      query.format,
      response,
    );
  }

  @Get('premium-fund')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  async premiumFund(
    @Query() query: ReportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      await this.reports.premiumFund(query),
      'fairtrade-premium-fund',
      query.format,
      response,
    );
  }

  @Get('farmers')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  async farmers(
    @Query() query: ReportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      await this.reports.farmersExport(query),
      'farmers',
      query.format,
      response,
    );
  }

  @Get('crop-cycles')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  async cropCycles(
    @Query() query: ReportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      await this.reports.cropCyclesExport(query),
      'crop-cycles',
      query.format,
      response,
    );
  }

  @Get('field-officer-performance')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({ summary: 'Field-officer performance: visits, farms mapped, farmers verified, activities logged' })
  async fieldOfficerPerformance(
    @Query() query: ReportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      await this.reports.fieldOfficerPerformance(),
      'field-officer-performance',
      query.format,
      response,
    );
  }

  @Get('insurance-coverage')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({ summary: 'Insurance coverage report: policies and claims by status/product type, exportable' })
  async insuranceCoverage(
    @Query() query: ReportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      await this.reports.insuranceCoverage(),
      'insurance-coverage',
      query.format,
      response,
    );
  }

  @Get('gender-youth-inclusion')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({ summary: 'Gender / youth inclusion breakdown across registered farmers' })
  async genderYouthInclusion(
    @Query() query: ReportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      await this.reports.genderYouthInclusion(query),
      'gender-youth-inclusion',
      query.format,
      response,
    );
  }

  @Get('kpis')
  kpis() {
    return this.reports.kpis();
  }

  @Get('compliance-summary')
  async complianceSummary() {
    const [kpis, membershipGrowth] = await Promise.all([
      this.reports.kpis(),
      this.reports.membershipGrowth(),
    ]);
    return {
      ...kpis,
      ...membershipGrowth,
      averageFarmerIncome: kpis.totalFarmers
        ? kpis.totalRevenue / kpis.totalFarmers
        : 0,
    };
  }

  @Get('impact')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR, UserRole.BUYER)
  impact() {
    return this.reports.impactReport();
  }

  @Get('flocert-audit-pack')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary:
      'FLOCERT/Fairtrade audit pack: payments, premium fund, traceability, governance and evidence gaps',
  })
  flocertAuditPack(@Query() query: ReportFormatDto) {
    return this.reports.flocertAuditPack(query);
  }

  @Get('export-info')
  exportInfo() {
    return {
      supportedFormats: ['json', 'csv', 'xlsx', 'pdf'],
      usage: 'Add ?format=csv, ?format=xlsx or ?format=pdf to a report endpoint.',
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @Get('premium-fund-balance')
  async premiumFundBalance() {
    const entries = await this.reports.premiumFund({});
    return {
      balance: entries.length ? entries[entries.length - 1].runningBalance : 0,
    };
  }

  // Premium income is automatic from a Sale. This route is intentionally for
  // expenses/corrections only, so staff cannot inflate the fund manually.
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @Get('premium-fund-entry-policy')
  premiumFundEntryPolicy() {
    return {
      income: 'created automatically from Fairtrade sales',
      expenses: 'record through POST /reports/premium-fund/entries',
    };
  }

  @Post('premium-fund/entries')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  createPremiumFundEntry(@Body() dto: CreatePremiumFundEntryDto) {
    return this.reports.createPremiumExpense(dto);
  }
}
