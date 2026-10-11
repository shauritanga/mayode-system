import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeMsisdn, SmsService } from '../messaging/sms.service';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth.dto';
import { OtpRegisterDto } from './dto/otp.dto';

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_RESEND_MS = 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_PER_DAY = 10;
const REGISTRATION_TOKEN_TTL = '10m';

export type OtpRequestResult = {
  sent: true;
  resendInSeconds: number;
  expiresInSeconds: number;
  /** Only when OTP_DEV_ECHO=true and SMS is simulated. Never set in production. */
  devCode?: string;
};
export type OtpVerifyResult =
  | ({ needsRegistration: false } & AuthResponseDto)
  | { needsRegistration: true; registrationToken: string; phone: string };

/**
 * Passwordless sign-in for the mobile app: a 6-digit code is texted to the phone, and entering it
 * proves ownership. Only a salted hash of the code is stored.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  private hash(phone: string, code: string) {
    const pepper = this.config.get<string>('JWT_SECRET') || 'otp';
    return createHash('sha256').update(`${pepper}:${phone}:${code}`).digest('hex');
  }

  async request(rawPhone: string, ip?: string): Promise<OtpRequestResult> {
    const phone = normalizeMsisdn(rawPhone);
    const now = new Date();

    const recent = await this.prisma.otpCode.findMany({
      where: { phone, createdAt: { gt: new Date(now.getTime() - 24 * 3_600_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const last = recent[0];
    if (last && now.getTime() - last.createdAt.getTime() < OTP_RESEND_MS) {
      const wait = Math.ceil((OTP_RESEND_MS - (now.getTime() - last.createdAt.getTime())) / 1000);
      throw new HttpException(`Wait ${wait} seconds before asking for another code.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const lastHour = recent.filter((r) => now.getTime() - r.createdAt.getTime() < 3_600_000).length;
    if (lastHour >= OTP_MAX_PER_HOUR || recent.length >= OTP_MAX_PER_DAY) {
      throw new HttpException('Too many codes requested for this number. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const row = await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        ip: ip ?? null,
      },
    });

    // The wording is the Android SMS User Consent format: the app can read the one message if the user allows.
    const accepted = await this.sms.sendTransactional(
      phone,
      `Your MAYODE verification code is ${code}. Do not share it with anyone.`,
      'otp',
      'MAYODE verification code (hidden)',
    );
    if (!accepted) {
      await this.prisma.otpCode.delete({ where: { id: row.id } });
      throw new ServiceUnavailableException('We could not send the code. Check the number and try again.');
    }

    const echo = this.config.get<string>('OTP_DEV_ECHO') === 'true' && !this.sms.isConfigured();
    return {
      sent: true,
      resendInSeconds: OTP_RESEND_MS / 1000,
      expiresInSeconds: OTP_TTL_MS / 1000,
      ...(echo ? { devCode: code } : {}),
    };
  }

  async verify(rawPhone: string, code: string): Promise<OtpVerifyResult> {
    const phone = normalizeMsisdn(rawPhone);
    const row = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const invalid = new UnauthorizedException('That code is wrong or has expired. Ask for a new one.');
    if (!row || row.attempts >= OTP_MAX_ATTEMPTS) throw invalid;

    const a = Buffer.from(this.hash(phone, code));
    const b = Buffer.from(row.codeHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await this.prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    // Single use: only the request that flips consumedAt wins.
    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) throw invalid;

    const session = await this.auth.loginVerifiedPhone(phone);
    if (session) return { needsRegistration: false, ...session };
    return {
      needsRegistration: true,
      phone,
      registrationToken: this.jwt.sign({ phone, purpose: 'otp-register', jti: randomBytes(8).toString('hex') }, { expiresIn: REGISTRATION_TOKEN_TTL }),
    };
  }

  async register(dto: OtpRegisterDto): Promise<AuthResponseDto> {
    let payload: { phone?: string; purpose?: string };
    try {
      payload = this.jwt.verify(dto.registrationToken);
    } catch {
      throw new UnauthorizedException('Your verification expired. Enter your phone number again.');
    }
    if (payload.purpose !== 'otp-register' || !payload.phone) {
      throw new UnauthorizedException('Your verification expired. Enter your phone number again.');
    }
    if (normalizeMsisdn(dto.phone) !== payload.phone) {
      throw new BadRequestException('The phone number does not match the one you verified.');
    }
    const { registrationToken: _token, ...form } = dto;
    void _token;
    return this.auth.registerVerifiedFarmer({ ...form, phone: payload.phone });
  }

  @Cron('0 3 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async purgeOld() {
    const res = await this.prisma.otpCode.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 48 * 3_600_000) } },
    });
    if (res.count) this.logger.log(`Removed ${res.count} old sign-in codes`);
  }
}
