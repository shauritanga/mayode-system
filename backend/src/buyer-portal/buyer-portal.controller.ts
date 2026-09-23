import { PermissionResource } from '../auth/role-access';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BuyerPortalService } from './buyer-portal.service';

@ApiTags('buyer-portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.BUYER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@PermissionResource('buyer_portal')
@Controller('buyer-portal')
export class BuyerPortalController {
  constructor(private readonly portal: BuyerPortalService) {}

  @Get('profile')
  @RequirePermission('buyer_portal', 'VIEW')
  profile() {
    return this.portal.profile();
  }

  @Get('me')
  @RequirePermission('buyer_portal', 'VIEW')
  me(@CurrentUser() user: any) {
    return this.portal.me(user);
  }

  @Get('dashboard')
  @RequirePermission('buyer_portal', 'VIEW')
  dashboard(@CurrentUser() user: any) {
    return this.portal.dashboard(user);
  }

  @Post('orders')
  @Roles(UserRole.BUYER)
  @RequirePermission('buyer_portal', 'CREATE')
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
  @RequirePermission('buyer_portal', 'VIEW')
  trace(@Param('reference') reference: string, @CurrentUser() user: any) {
    return this.portal.traceability(reference, user);
  }
}
