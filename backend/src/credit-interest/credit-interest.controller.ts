import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { RecordPaymentDto } from '../dues/dto/dues.dto';
import { CreditInterestService } from './credit-interest.service';
import { RateDto, SaveTermsDto } from './dto/credit-interest.dto';

@ApiTags('credit-interest') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @Controller('credit-interest')
export class CreditInterestController {
  constructor(private readonly svc: CreditInterestService) {}
  @Get('terms') @RequirePermission('input_distribution', 'VIEW')
  terms(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.terms(u, m); }
  @Put('terms') @RequirePermission('amcos_settings', 'EDIT')
  saveTerms(@CurrentUser() u: RequestUser, @Body() dto: SaveTermsDto, @Query('mamcosId') m?: string) { return this.svc.saveTerms(u, dto, m); }
  @Post('rates') @RequirePermission('amcos_settings', 'EDIT')
  addRate(@CurrentUser() u: RequestUser, @Body() dto: RateDto, @Query('mamcosId') m?: string) { return this.svc.addRate(u, dto, m); }
  @Put('rates/:id') @RequirePermission('amcos_settings', 'EDIT')
  updateRate(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: RateDto, @Query('mamcosId') m?: string) { return this.svc.updateRate(u, id, dto, m); }
  @Delete('rates/:id') @RequirePermission('amcos_settings', 'EDIT')
  removeRate(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.svc.removeRate(u, id, m); }
  @Post('accrue') @RequirePermission('amcos_settings', 'EDIT')
  accrue(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.accrueNow(u, m); }
  @Get('preview') @RequirePermission('input_distribution', 'VIEW')
  preview(@CurrentUser() u: RequestUser, @Query('amount') amount: string, @Query('issuedOn') on?: string, @Query('mamcosId') m?: string) { return this.svc.preview(u, Number(amount) || 0, on, m); }
  @Get('credit/:dueId') @RequirePermission('dues', 'VIEW')
  account(@CurrentUser() u: RequestUser, @Param('dueId') id: string, @Query('mamcosId') m?: string) { return this.svc.account(u, id, m); }
  @Post('credit/:dueId/pay') @RequirePermission('dues', 'CREATE')
  pay(@CurrentUser() u: RequestUser, @Param('dueId') id: string, @Body() dto: RecordPaymentDto, @Query('mamcosId') m?: string) { return this.svc.pay(u, id, dto, m); }
}
