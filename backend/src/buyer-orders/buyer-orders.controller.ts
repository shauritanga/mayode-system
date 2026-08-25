import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BuyersService } from '../buyers/buyers.service';
import { BuyerOrdersService } from './buyer-orders.service';
import {
  CreateBuyerOrderDto,
  UpdateBuyerOrderStatusDto,
} from './dto/buyer-order.dto';

const STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MAMCOS_SECRETARY,
];

@ApiTags('buyer-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('buyer-orders')
export class BuyerOrdersController {
  constructor(
    private readonly buyerOrders: BuyerOrdersService,
    private readonly buyers: BuyersService,
  ) {}

  @Post()
  @Roles(...STAFF_ROLES, UserRole.BUYER)
  @RequirePermission('buyer_orders', 'CREATE')
  async create(@Body() dto: CreateBuyerOrderDto, @CurrentUser() user: any) {
    if (user.role === UserRole.BUYER) {
      const company = await this.buyers.requireMatchedBuyer(user);
      dto = { ...dto, buyerId: company.id };
    }
    return this.buyerOrders.create(dto);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @RequirePermission('buyer_orders', 'VIEW')
  findAll() {
    return this.buyerOrders.findAll();
  }

  @Get('buyer/:buyerId')
  @Roles(...STAFF_ROLES, UserRole.BUYER)
  async findForBuyer(
    @Param('buyerId') buyerId: string,
    @CurrentUser() user: any,
  ) {
    await this.buyers.assertBuyerAccess(user, buyerId);
    return this.buyerOrders.findForBuyer(buyerId);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES, UserRole.BUYER)
  @RequirePermission('buyer_orders', 'VIEW')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const order = await this.buyerOrders.findOne(id);
    await this.buyers.assertBuyerAccess(user, order.buyerId);
    return order;
  }

  @Patch(':id/status')
  @Roles(...STAFF_ROLES)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBuyerOrderStatusDto,
  ) {
    return this.buyerOrders.updateStatus(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('buyer_orders', 'DELETE')
  remove(@Param('id') id: string) {
    return this.buyerOrders.remove(id);
  }
}
