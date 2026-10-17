import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { MarketService } from './market.service';
import { RecordPriceDto } from './dto/market-price.dto';

const VIEW = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY, UserRole.AUDITOR];
const WRITE = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY];

@ApiTags('market')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('overview')
  @Roles(...VIEW)
  @RequirePermission('sales', 'VIEW')
  overview(@CurrentUser() user: RequestUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.market.overview(user, { from, to });
  }

  @Get('deliveries')
  @Roles(...VIEW)
  @RequirePermission('sales', 'VIEW')
  deliveries(@CurrentUser() user: RequestUser, @Query('from') from?: string, @Query('to') to?: string, @Query('buyerId') buyerId?: string) {
    return this.market.deliveries(user, { from, to, buyerId });
  }

  @Get('farmer-sales')
  @Roles(...VIEW)
  @RequirePermission('sales', 'VIEW')
  farmerSales(@CurrentUser() user: RequestUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.market.farmerSales(user, { from, to });
  }

  @Get('prices')
  @Roles(...VIEW)
  @RequirePermission('marketplace', 'VIEW')
  prices(@CurrentUser() user: RequestUser, @Query('commodity') commodity?: string, @Query('market') market?: string) {
    return this.market.prices(user, { commodity, market });
  }

  @Post('prices')
  @Roles(...WRITE)
  @RequirePermission('marketplace', 'CREATE')
  recordPrice(@Body() dto: RecordPriceDto, @CurrentUser() user: RequestUser) {
    return this.market.recordPrice(dto, user);
  }
}
