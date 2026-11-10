import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CostCenter } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { PayrollService } from './payroll.service';
import {
  ApproveRunDto, AttendanceDayDto, AttendanceDto, BudgetDto, CreatePayeeDto, CreateRunDto, CreateTitleDto, OutputDto, PostRunDto, ReturnRunDto, SubmitRunDto, UpdateLineDto, UpdatePayeeDto, UpdateTitleDto,
} from './dto/payroll.dto';

@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  // Job titles
  @Get('titles') @RequirePermission('payroll', 'VIEW')
  titles(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.payroll.titles(u, m); }
  @Post('titles') @RequirePermission('payroll', 'CREATE')
  createTitle(@CurrentUser() u: RequestUser, @Body() dto: CreateTitleDto, @Query('mamcosId') m?: string) { return this.payroll.createTitle(u, dto, m); }
  @Patch('titles/:id') @RequirePermission('payroll', 'EDIT')
  updateTitle(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateTitleDto, @Query('mamcosId') m?: string) { return this.payroll.updateTitle(u, id, dto, m); }

  // The personnel and wage registry
  @Get('payees') @RequirePermission('payroll', 'VIEW')
  payees(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.payroll.payees(u, m); }
  @Get('candidates') @RequirePermission('payroll', 'VIEW')
  candidates(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.payroll.candidates(u, m); }
  @Post('payees') @RequirePermission('payroll', 'CREATE')
  addPayee(@CurrentUser() u: RequestUser, @Body() dto: CreatePayeeDto, @Query('mamcosId') m?: string) { return this.payroll.addPayee(u, dto, m); }
  @Patch('payees/:id') @RequirePermission('payroll', 'EDIT')
  updatePayee(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdatePayeeDto, @Query('mamcosId') m?: string) { return this.payroll.updatePayee(u, id, dto, m); }
  @Post('payees/:id/verify') @RequirePermission('payroll_approval', 'EDIT')
  verifyPayee(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.payroll.verifyPayee(u, id, m); }
  @Get('payees/:id/history') @RequirePermission('payroll', 'VIEW')
  history(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.payroll.history(u, id, m); }

  // Attendance and output, recorded by supervisors
  @Get('attendance') @RequirePermission('payroll_attendance', 'VIEW')
  attendance(@CurrentUser() u: RequestUser, @Query() q: { period?: string; payeeId?: string; mamcosId?: string }) { return this.payroll.attendance(u, q, q.mamcosId); }
  @Post('attendance') @RequirePermission('payroll_attendance', 'CREATE')
  markAttendance(@CurrentUser() u: RequestUser, @Body() dto: AttendanceDto, @Query('mamcosId') m?: string) { return this.payroll.markAttendance(u, dto, m); }
  @Post('attendance/day') @RequirePermission('payroll_attendance', 'CREATE')
  markDay(@CurrentUser() u: RequestUser, @Body() dto: AttendanceDayDto, @Query('mamcosId') m?: string) { return this.payroll.markDay(u, dto, m); }
  @Delete('attendance/:id') @RequirePermission('payroll_attendance', 'EDIT')
  removeAttendance(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.payroll.removeAttendance(u, id, m); }
  @Get('output') @RequirePermission('payroll_attendance', 'VIEW')
  outputs(@CurrentUser() u: RequestUser, @Query() q: { period?: string; payeeId?: string; mamcosId?: string }) { return this.payroll.outputs(u, q, q.mamcosId); }
  @Post('output') @RequirePermission('payroll_attendance', 'CREATE')
  addOutput(@CurrentUser() u: RequestUser, @Body() dto: OutputDto, @Query('mamcosId') m?: string) { return this.payroll.addOutput(u, dto, m); }

  // Budget lines
  @Get('budgets') @RequirePermission('payroll', 'VIEW')
  budgets(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.payroll.budgets(u, m); }
  @Put('budgets/:costCenter') @RequirePermission('payroll_approval', 'EDIT')
  setBudget(@CurrentUser() u: RequestUser, @Param('costCenter') c: CostCenter, @Body() dto: BudgetDto, @Query('mamcosId') m?: string) { return this.payroll.setBudget(u, c, dto.monthlyLimit, m); }

  // The monthly run: compile, submit, approve, pay
  @Get('runs') @RequirePermission('payroll', 'VIEW')
  runs(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.payroll.runs(u, m); }
  @Post('runs') @RequirePermission('payroll', 'CREATE')
  createRun(@CurrentUser() u: RequestUser, @Body() dto: CreateRunDto, @Query('mamcosId') m?: string) { return this.payroll.createRun(u, dto, m); }
  @Get('runs/:id') @RequirePermission('payroll', 'VIEW')
  run(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.payroll.run(u, id, m); }
  @Delete('runs/:id') @RequirePermission('payroll', 'DELETE')
  deleteRun(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.payroll.deleteRun(u, id, m); }
  @Post('runs/:id/recompile') @RequirePermission('payroll', 'EDIT')
  recompile(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.payroll.recompile(u, id, m); }
  @Patch('runs/:id/lines/:lineId') @RequirePermission('payroll', 'EDIT')
  updateLine(@CurrentUser() u: RequestUser, @Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: UpdateLineDto, @Query('mamcosId') m?: string) {
    return this.payroll.updateLine(u, id, lineId, dto, m);
  }
  @Post('runs/:id/submit') @RequirePermission('payroll', 'EDIT')
  submit(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: SubmitRunDto, @Query('mamcosId') m?: string) { return this.payroll.submit(u, id, dto, m); }
  @Post('runs/:id/return') @RequirePermission('payroll_approval', 'EDIT')
  returnRun(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReturnRunDto, @Query('mamcosId') m?: string) { return this.payroll.returnRun(u, id, dto.reason, m); }
  @Post('runs/:id/approve') @RequirePermission('payroll_approval', 'EDIT')
  approve(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ApproveRunDto, @Query('mamcosId') m?: string) { return this.payroll.approve(u, id, dto, m); }
  @Post('runs/:id/post') @RequirePermission('payroll', 'EDIT')
  post(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: PostRunDto, @Query('mamcosId') m?: string) { return this.payroll.post(u, id, dto, m); }
  @Get('runs/:id/payslips/:lineId') @RequirePermission('payroll', 'VIEW')
  payslip(@CurrentUser() u: RequestUser, @Param('id') id: string, @Param('lineId') lineId: string, @Query('mamcosId') m?: string) { return this.payroll.payslip(u, id, lineId, m); }
}
