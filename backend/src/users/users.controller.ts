import {
  Controller,
  Get,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto, UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import type { RequestUser } from '../common/ownership.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users (Super Admin / Admin only)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update user base settings. Self-service for own profile fields; role/active-status changes and editing other accounts require Super Admin / Admin.',
  })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.update(id, updateUserDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete user account (Super Admin only)' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Put('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Update the authenticated user’s own profile (name, email, phone, language). Role and active status can never be changed through this endpoint.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Phone number or email already in use by another account',
  })
  updateProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Put('push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Register or update the Expo Push Notification token for the authenticated user',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', example: 'ExponentPushToken[xxxxxx]' },
      },
      required: ['token'],
    },
  })
  updatePushToken(
    @CurrentUser() user: { id: string },
    @Body('token') token: string,
  ) {
    return this.usersService.updatePushToken(user.id, token);
  }
}
