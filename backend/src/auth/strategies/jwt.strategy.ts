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
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'mayode-super-secret-key-change-in-production-2026',
    });
  }

  async validate(payload: { sub: string; phone: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        farmer: true,
        customRole: {
          include: { permissions: { include: { resource: true } } },
        },
        mamcosStaff: { select: { mamcosId: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or unauthorized');
    }

    let controlNumber: string | undefined = undefined;
    if (user.farmer) {
      controlNumber = user.farmer.controlNumber;
    }

    // A user's own cooperative — from their staff assignment, or their
    // farmer profile — used to scope data access to that AMCOS alone. See
    // OwnershipService.resolveTenantMamcosId for how this is applied.
    const mamcosId = user.mamcosStaff?.mamcosId ?? user.farmer?.mamcosId ?? null;

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      roleId: user.roleId,
      customRole: user.customRole,
      mamcosId,
      language: user.language,
      controlNumber,
    };
  }
}
