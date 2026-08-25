import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateLoanDto } from './dto/loans.dto';
import { LoansService } from './loans.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { ExportService } from '../common/export.service';
@ApiTags('loans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('loans')
export class LoansController {
  constructor(
    private readonly loans: LoansService,
    private readonly exporter: ExportService,
  ) {}
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('loans', 'CREATE')
  create(@Body() dto: CreateLoanDto) {
    return this.loans.create(dto);
  }
  @Get('farmer/:farmerId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FINANCIAL_PROVIDER,
    UserRole.FARMER,
  )
  list(@Param('farmerId') farmerId: string) {
    return this.loans.listForFarmer(farmerId);
  }
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.AUDITOR,
    UserRole.FINANCIAL_PROVIDER,
  )
  @RequirePermission('loans', 'VIEW')
  findAll() {
    return this.loans.findAll();
  }
  @Post('sales/:saleId/approve-payouts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  approve(@Param('saleId') saleId: string, @CurrentUser() user: RequestUser) {
    return this.loans.approveAndInitiateSalePayouts(saleId, user.id);
  }
  @Post('sales/:saleId/reconcile-payouts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  reconcile(@Param('saleId') saleId: string) {
    return this.loans.reconcileSalePayouts(saleId);
  }

  @Get('lender-payout-report')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)
  @RequirePermission('loans', 'VIEW')
  async payoutReport(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('format') format: 'csv' | 'pdf' | 'xlsx' | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const deductions = await this.loans.lenderPayoutReport(from, to);
    const rows = deductions.map((d) => ({
      date: d.createdAt.toISOString().slice(0, 10),
      lender: d.loanRecord.lender?.name ?? d.loanRecord.lenderName,
      payoutPhone:
        d.loanRecord.lender?.payoutPhone ?? d.loanRecord.lenderPayoutPhone ?? '',
      payoutName:
        d.loanRecord.lender?.payoutName ?? d.loanRecord.lenderPayoutName ?? '',
      farmer: `${d.loanRecord.farmer.firstName} ${d.loanRecord.farmer.lastName}`,
      controlNumber: d.loanRecord.farmer.controlNumber,
      amount: d.amount,
      status: d.payoutStatus,
      orderReference: d.orderReference ?? '',
    }));
    if (!format || format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="lender-payouts.csv"',
      );
      return response.send(this.exporter.csv(rows));
    }
    if (format === 'pdf') {
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="lender-payouts.pdf"',
      );
      return response.send(await this.exporter.pdf(rows, 'Lender payouts'));
    }
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="lender-payouts.xlsx"',
    );
    return response.send(this.exporter.xlsx(rows, 'Lender payouts'));
  }
}
