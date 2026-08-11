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
import { Roles } from '../auth/decorators/roles.decorator';
import { BuyerOrdersService } from './buyer-orders.service';
import { CreateBuyerOrderDto, UpdateBuyerOrderStatusDto } from './dto/buyer-order.dto';

const STAFF_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY];

@ApiTags('buyer-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buyer-orders')
export class BuyerOrdersController {
  constructor(private readonly buyerOrders: BuyerOrdersService) {}

  @Post()
  @Roles(...STAFF_ROLES, UserRole.BUYER)
  create(@Body() dto: CreateBuyerOrderDto) {
    return this.buyerOrders.create(dto);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  findAll() {
    return this.buyerOrders.findAll();
  }

  @Get('buyer/:buyerId')
  @Roles(...STAFF_ROLES, UserRole.BUYER)
  findForBuyer(@Param('buyerId') buyerId: string) {
    return this.buyerOrders.findForBuyer(buyerId);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES, UserRole.BUYER)
  findOne(@Param('id') id: string) {
    return this.buyerOrders.findOne(id);
  }

  @Patch(':id/status')
  @Roles(...STAFF_ROLES)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateBuyerOrderStatusDto) {
    return this.buyerOrders.updateStatus(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.buyerOrders.remove(id);
  }
}
