import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { PayrollService } from './payroll.service';
import { CreatePayeeDto, CreateRunDto, PostRunDto, UpdateLineDto, UpdatePayeeDto } from './dto/payroll.dto';

@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('payees') @RequirePermission('payroll', 'VIEW')
  payees(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.payroll.payees(u, m); }
  @Get('candidates') @RequirePermission('payroll', 'VIEW')
  candidates(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.payroll.candidates(u, m); }
  @Post('payees') @RequirePermission('payroll', 'CREATE')
  addPayee(@CurrentUser() u: RequestUser, @Body() dto: CreatePayeeDto, @Query('mamcosId') m?: string) { return this.payroll.addPayee(u, dto, m); }
  @Patch('payees/:id') @RequirePermission('payroll', 'EDIT')
  updatePayee(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdatePayeeDto, @Query('mamcosId') m?: string) { return this.payroll.updatePayee(u, id, dto, m); }

  @Get('runs') @RequirePermission('payroll', 'VIEW')
  runs(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.payroll.runs(u, m); }
  @Post('runs') @RequirePermission('payroll', 'CREATE')
  createRun(@CurrentUser() u: RequestUser, @Body() dto: CreateRunDto, @Query('mamcosId') m?: string) { return this.payroll.createRun(u, dto, m); }
  @Get('runs/:id') @RequirePermission('payroll', 'VIEW')
  run(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.payroll.run(u, id, m); }
  @Delete('runs/:id') @RequirePermission('payroll', 'DELETE')
  deleteRun(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.payroll.deleteRun(u, id, m); }
  @Patch('runs/:id/lines/:lineId') @RequirePermission('payroll', 'EDIT')
  updateLine(@CurrentUser() u: RequestUser, @Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: UpdateLineDto, @Query('mamcosId') m?: string) {
    return this.payroll.updateLine(u, id, lineId, dto, m);
  }
  @Post('runs/:id/post') @RequirePermission('payroll', 'EDIT')
  post(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: PostRunDto, @Query('mamcosId') m?: string) { return this.payroll.post(u, id, dto, m); }
  @Get('runs/:id/payslips/:lineId') @RequirePermission('payroll', 'VIEW')
  payslip(@CurrentUser() u: RequestUser, @Param('id') id: string, @Param('lineId') lineId: string, @Query('mamcosId') m?: string) { return this.payroll.payslip(u, id, lineId, m); }
}
