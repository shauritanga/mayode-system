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
import { BuyersService } from './buyers.service';
import { UpsertBuyerDto } from './dto/buyer.dto';

@ApiTags('buyers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('buyers')
export class BuyersController {
  constructor(private readonly buyers: BuyersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('buyers', 'CREATE')
  create(@Body() dto: UpsertBuyerDto) {
    return this.buyers.create(dto);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
    UserRole.FIELD_OFFICER,
  )
  @RequirePermission('buyers', 'VIEW')
  findAll() {
    return this.buyers.findAll();
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @RequirePermission('buyers', 'VIEW')
  findOne(@Param('id') id: string) {
    return this.buyers.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('buyers', 'EDIT')
  update(@Param('id') id: string, @Body() dto: UpsertBuyerDto) {
    return this.buyers.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('buyers', 'DELETE')
  remove(@Param('id') id: string) {
    return this.buyers.remove(id);
  }
}
