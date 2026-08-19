import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BuyerPortalService } from './buyer-portal.service';

@ApiTags('buyer-portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BUYER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('buyer-portal')
export class BuyerPortalController {
  constructor(private readonly portal: BuyerPortalService) {}

  @Get('profile')
  profile() {
    return this.portal.profile();
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return this.portal.me(user);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: any) {
    return this.portal.dashboard(user);
  }

  @Post('orders')
  @Roles(UserRole.BUYER)
  createOrder(
    @CurrentUser() user: any,
    @Body()
    dto: {
      riceVariety?: string;
      quantityRequiredKg: number;
      qualityRequirements?: string;
      requiredByDate?: string;
      notes?: string;
    },
  ) {
    return this.portal.createOrder(user, dto);
  }

  @Get('traceability/:reference')
  trace(@Param('reference') reference: string, @CurrentUser() user: any) {
    return this.portal.traceability(reference, user);
  }
}
