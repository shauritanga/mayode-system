import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { OtpRegisterDto, RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';
import {
  RegisterDto,
  FarmerSelfRegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { CreateCooperativeAdminDto } from './dto/create-cooperative-admin.dto';
import { RequirePermission } from './decorators/require-permission.decorator';
import type { DelegatingActor } from './delegation';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otp: OtpService,
  ) {}

  // ---- Passwordless sign-in for the mobile app: phone number, then the code sent by SMS ----
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Text a 6-digit sign-in code to a phone number' })
  requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.otp.request(dto.phone, req.ip, dto.intent);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check the code: signs in, or returns a token to finish sign-up for a new number' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.otp.verify(dto.phone, dto.code);
  }

  @Post('otp/register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Finish sign-up for a verified new number (no password)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AuthResponseDto })
  registerWithOtp(@Body() dto: OtpRegisterDto) {
    return this.otp.register(dto);
  }

  // Compatibility endpoint for deployed mobile clients and older app builds.
  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Farmer self-registration with the configured custom Farmer role' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AuthResponseDto })
  async registerFarmerCompatibility(@Body() dto: FarmerSelfRegisterDto): Promise<AuthResponseDto> {
    return this.authService.selfRegisterFarmer(dto);
  }

  @Post('register/farmer')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Farmer self-registration with the configured custom Farmer role' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AuthResponseDto })
  async registerFarmer(@Body() dto: FarmerSelfRegisterDto): Promise<AuthResponseDto> {
    return this.authService.selfRegisterFarmer(dto);
  }

  @Post('register/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Super Admin creates a farmer account with an explicitly selected custom role.',
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
  async register(@Body() registerDto: RegisterDto, @CurrentUser() user: { role: UserRole }): Promise<AuthResponseDto> {
    return this.authService.register(registerDto, user.role);
  }

  @Post('staff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  // Super Admin always; a cooperative admin needs the `users` CREATE grant and is confined to their AMCOS.
  @RequirePermission('users', 'CREATE')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Super Admin creates an account with a custom roleId, or explicitly grants the built-in Super Admin role.',
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
    @CurrentUser() actor: DelegatingActor,
  ) {
    return this.authService.createStaffAccount(dto, actor);
  }

  @Post('cooperative-admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Super Admin registers the administrator of a cooperative; they manage that AMCOS’s roles and staff.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Cooperative admin created' })
  createCooperativeAdmin(@Body() dto: CreateCooperativeAdminDto) {
    return this.authService.createCooperativeAdmin(dto);
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

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Choose a new password (required after receiving a temporary one)' })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: { id: string }) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Current-session profile: role, custom role name, and flattened resource permissions for client-side guards',
  })
  async me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
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
