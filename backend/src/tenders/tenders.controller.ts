import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { TendersService } from './tenders.service';
import { ContractorsService } from './contractors.service';
import { TenderMilestonesService } from './tender-milestones.service';
import { BidDto, CreateTenderDto, NoteDto, PayMilestoneDto, RateDto, ReasonDto, RecommendDto, RegisterContractorDto, SignOffDto, SubmitMilestoneDto, TenderQueryDto, UpdateContractorDto, VetContractorDto } from './dto/tenders.dto';

/** Anyone: the open tenders, and a contractor registering. */
@ApiTags('tenders')
@Controller('public')
export class TendersPublicController {
  constructor(private readonly tenders: TendersService, private readonly contractors: ContractorsService) {}

  @Get('tenders') list() { return this.tenders.publicList(); }
  @Get('tenders/:id') one(@Param('id') id: string) { return this.tenders.publicOne(id); }
  @Post('contractors/register') register(@Body() dto: RegisterContractorDto) { return this.contractors.register(dto); }
}

/** The AMCOS office: Procurement Officer, Manager, Accountant and the canal and block chairmen. */
@ApiTags('tenders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('tenders')
export class TendersController {
  constructor(private readonly tenders: TendersService, private readonly milestones: TenderMilestonesService, private readonly contractors: ContractorsService) {}

  // fixed paths before ":id"
  @Get('contractors') @RequirePermission('tender_contractors', 'VIEW')
  contractorList(@Query() q: TenderQueryDto) { return this.contractors.list(q); }

  @Post('contractors/:id/vet') @RequirePermission('tender_contractors', 'EDIT')
  vet(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: VetContractorDto) { return this.contractors.vet(u, id, dto); }

  @Get('structure') @RequirePermission('tenders', 'VIEW')
  structure(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.tenders.structure(u, m); }

  @Get('milestones/mine') @RequirePermission('tender_milestones', 'VIEW')
  forChairman(@CurrentUser() u: RequestUser) { return this.milestones.forChairman(u); }

  @Post('milestones/:id/sign-off') @RequirePermission('tender_milestones', 'EDIT')
  signOff(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: SignOffDto) { return this.milestones.signOff(u, id, dto.note); }

  @Post('milestones/:id/rework') @RequirePermission('tender_milestones', 'EDIT')
  rework(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: SignOffDto) { return this.milestones.requestRework(u, id, dto.note); }

  @Post('milestones/:id/approve-payment') @RequirePermission('tender_approval', 'EDIT')
  approvePayment(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.milestones.approvePayment(u, id); }

  @Post('milestones/:id/pay') @RequirePermission('tender_payments', 'EDIT')
  pay(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: PayMilestoneDto) { return this.milestones.pay(u, id, dto); }

  @Get() @RequirePermission('tenders', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: TenderQueryDto) { return this.tenders.list(u, q); }

  @Post() @RequirePermission('tenders', 'CREATE')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateTenderDto, @Query('mamcosId') m?: string) { return this.tenders.create(u, dto, m); }

  @Get(':id') @RequirePermission('tenders', 'VIEW')
  detail(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.tenders.detail(u, id, m); }

  @Post(':id/publish') @RequirePermission('tenders', 'EDIT')
  publish(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.tenders.publish(u, id, m); }

  @Post(':id/cancel') @RequirePermission('tenders', 'EDIT')
  cancel(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto, @Query('mamcosId') m?: string) { return this.tenders.cancel(u, id, dto.reason, m); }

  @Post(':id/open-bids') @RequirePermission('tenders', 'EDIT')
  openBids(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.tenders.openBids(u, id, m); }

  @Post(':id/recommend') @RequirePermission('tenders', 'EDIT')
  recommend(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: RecommendDto, @Query('mamcosId') m?: string) { return this.tenders.recommend(u, id, dto, m); }

  @Post(':id/return') @RequirePermission('tender_approval', 'EDIT')
  returnIt(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto, @Query('mamcosId') m?: string) { return this.tenders.returnRecommendation(u, id, dto.reason, m); }

  @Post(':id/approve') @RequirePermission('tender_approval', 'EDIT')
  approve(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.tenders.approve(u, id, m); }

  @Post(':id/rate') @RequirePermission('tender_approval', 'EDIT')
  rate(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: RateDto, @Query('mamcosId') m?: string) { return this.tenders.rate(u, id, dto.rating, m); }
}

/** The contractor's own portal. */
@ApiTags('tenders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('contractor')
export class ContractorPortalController {
  constructor(private readonly tenders: TendersService, private readonly milestones: TenderMilestonesService, private readonly contractors: ContractorsService) {}

  @Get('me') @RequirePermission('tender_bidding', 'VIEW')
  me(@CurrentUser() u: RequestUser) { return this.contractors.me(u); }

  @Put('me') @RequirePermission('tender_bidding', 'CREATE')
  updateMe(@CurrentUser() u: RequestUser, @Body() dto: UpdateContractorDto) { return this.contractors.updateMe(u, dto); }

  @Get('tenders') @RequirePermission('tender_bidding', 'VIEW')
  open(@CurrentUser() u: RequestUser) { return this.tenders.openForContractor(u); }

  @Get('bids') @RequirePermission('tender_bidding', 'VIEW')
  bids(@CurrentUser() u: RequestUser) { return this.tenders.myBids(u); }

  @Get('contracts') @RequirePermission('tender_bidding', 'VIEW')
  contracts(@CurrentUser() u: RequestUser) { return this.tenders.myContracts(u); }

  @Put('tenders/:id/bid') @RequirePermission('tender_bidding', 'CREATE')
  bid(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: BidDto) { return this.tenders.submitBid(u, id, dto); }

  @Post('tenders/:id/withdraw') @RequirePermission('tender_bidding', 'CREATE')
  withdraw(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.tenders.withdrawBid(u, id); }

  @Post('milestones/:id/submit') @RequirePermission('tender_bidding', 'CREATE')
  submit(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: SubmitMilestoneDto) { return this.milestones.submit(u, id, dto); }
}
