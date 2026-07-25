import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'mayode-super-secret-key-change-in-production-2026',
    });
  }

  async validate(payload: { sub: string; phone: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        farmer: true,
        fieldOfficer: true,
        mamcosSecretary: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or unauthorized');
    }

    let controlNumber: string | undefined = undefined;
    if (user.farmer) {
      controlNumber = user.farmer.controlNumber;
    }

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      language: user.language,
      controlNumber,
    };
  }
}
