import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { DuesService } from './dues.service';
import {
  ChargeDto, CreateDueDto, CreateDueTypeDto, DueListQueryDto, IssueFertiliserDto, ReasonDto, RecordPaymentDto, UpdateDueTypeDto, WaiveDto,
} from './dto/dues.dto';

@ApiTags('dues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('dues')
export class DuesController {
  constructor(private readonly dues: DuesService) {}

  @Get() @RequirePermission('dues', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: DueListQueryDto) { return this.dues.list(u, q); }
  @Post() @RequirePermission('dues', 'CREATE')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateDueDto, @Query('mamcosId') m?: string) { return this.dues.createDue(u, dto, m); }

  // fixed paths before ":id"
  @Get('types') @RequirePermission('dues', 'VIEW')
  types(@CurrentUser() u: RequestUser, @Query() q: { mamcosId?: string; includeInactive?: string }) { return this.dues.listTypes(u, q); }
  @Post('types') @RequirePermission('dues', 'CREATE')
  createType(@CurrentUser() u: RequestUser, @Body() dto: CreateDueTypeDto, @Query('mamcosId') m?: string) { return this.dues.createType(u, dto, m); }
  @Patch('types/:id') @RequirePermission('dues', 'EDIT')
  updateType(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateDueTypeDto, @Query('mamcosId') m?: string) { return this.dues.updateType(u, id, dto, m); }
  @Get('types/:id/preview') @RequirePermission('dues', 'VIEW')
  preview(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query() q: { mamcosId?: string }) { return this.dues.previewCharge(u, id, q); }
  @Post('types/:id/charge') @RequirePermission('dues', 'CREATE')
  charge(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ChargeDto, @Query('mamcosId') m?: string) { return this.dues.charge(u, id, dto, m); }

  @Post('fertiliser') @RequirePermission('dues', 'CREATE')
  fertiliser(@CurrentUser() u: RequestUser, @Body() dto: IssueFertiliserDto, @Query('mamcosId') m?: string) { return this.dues.issueFertiliser(u, dto, m); }
  @Get('farmers') @RequirePermission('dues', 'VIEW')
  farmers(@CurrentUser() u: RequestUser, @Query() q: { mamcosId?: string; q?: string }) { return this.dues.farmers(u, q); }
  @Get('farmers/:farmerId') @RequirePermission('dues', 'VIEW')
  statement(@CurrentUser() u: RequestUser, @Param('farmerId') farmerId: string, @Query('mamcosId') m?: string) { return this.dues.statement(u, farmerId, m); }
  @Get('arrears') @RequirePermission('dues', 'VIEW')
  arrears(@CurrentUser() u: RequestUser, @Query() q: { mamcosId?: string; category?: any }) { return this.dues.arrears(u, q); }
  @Post('payments/:paymentId/void') @RequirePermission('dues', 'DELETE')
  voidPayment(@CurrentUser() u: RequestUser, @Param('paymentId') id: string, @Body() dto: ReasonDto, @Query('mamcosId') m?: string) { return this.dues.voidPayment(u, id, dto.reason, m); }

  @Get(':id') @RequirePermission('dues', 'VIEW')
  detail(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.dues.detail(u, id, m); }
  @Post(':id/payments') @RequirePermission('dues', 'CREATE')
  pay(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: RecordPaymentDto, @Query('mamcosId') m?: string) { return this.dues.recordPayment(u, id, dto, m); }
  @Post(':id/waive') @RequirePermission('dues', 'DELETE')
  waive(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: WaiveDto, @Query('mamcosId') m?: string) { return this.dues.waive(u, id, dto, m); }
  @Post(':id/cancel') @RequirePermission('dues', 'DELETE')
  cancel(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto, @Query('mamcosId') m?: string) { return this.dues.cancel(u, id, dto.reason, m); }
}
