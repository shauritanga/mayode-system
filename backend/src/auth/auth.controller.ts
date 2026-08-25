import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
} from './dto/auth.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Public self-registration. Always creates a FARMER account regardless of the role field sent.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Phone number or email already exists',
  })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('staff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a staff account. SUPER_ADMIN/ADMIN can create any role (a plain ADMIN cannot create SUPER_ADMIN or ADMIN accounts) and may optionally assign a custom Role (from Role Management) via roleId for finer-grained resource permissions. An AMCOS Secretary can only create Field Officer accounts, scoped to their own AMCOS, and cannot assign custom roles.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Staff account created',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient privilege to grant the requested role',
  })
  async createStaffAccount(
    @Body() dto: CreateStaffUserDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.authService.createStaffAccount(dto, user.role, user.id);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with phone number and password' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successful login',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many login attempts — try again later',
  })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using a valid refresh token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'New token pair issued',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired refresh token',
  })
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<AuthResponseDto> {
    return this.authService.refresh(refreshTokenDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out user and invalidate refresh tokens' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged out successfully',
  })
  async logout(
    @CurrentUser() user: { id: string },
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.logout(user.id);
  }
}
