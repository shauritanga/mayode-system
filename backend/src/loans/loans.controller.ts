import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateLoanDto } from './dto/loans.dto';
import { LoansService } from './loans.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
@ApiTags('loans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
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
}
