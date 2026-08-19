import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FarmersService } from '../farmers/farmers.service';

/** Stable external contract version for partner credit-profile responses. */
export const CREDIT_PROFILE_SCHEMA = 'mayode.credit-profile.v1';

const HOURLY_REQUEST_LIMIT = 120;

@Injectable()
export class PartnerApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly farmers: FarmersService,
  ) {}

  async createKey(partnerName: string) {
    const name = partnerName?.trim();
    if (!name) throw new BadRequestException('partnerName is required');
    const secret = randomBytes(32).toString('base64url');
    const prefix = `myd_${randomBytes(4).toString('hex')}`;
    const key = `${prefix}_${secret}`;
    const record = await this.prisma.partnerApiKey.create({
      data: {
        partnerName: name,
        keyPrefix: prefix,
        keyHash: await bcrypt.hash(key, 12),
      },
    });
    return {
      id: record.id,
      partnerName: name,
      apiKey: key,
      warning: 'Store this key now; it cannot be retrieved again.',
      schema: CREDIT_PROFILE_SCHEMA,
      endpoints: {
        creditProfile: 'GET /partner/v1/farmers/:id/credit-profile',
        authHeader: 'X-API-Key',
      },
    };
  }

  listKeys() {
    return this.prisma.partnerApiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        partnerName: true,
        keyPrefix: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
        _count: { select: { requests: true } },
      },
    });
  }

  async revokeKey(id: string) {
    const key = await this.prisma.partnerApiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('Partner API key not found');
    return this.prisma.partnerApiKey.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        partnerName: true,
        keyPrefix: true,
        isActive: true,
        lastUsedAt: true,
      },
    });
  }

  listRequests(apiKeyId: string, take = 50) {
    return this.prisma.partnerApiRequest.findMany({
      where: { apiKeyId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
      select: {
        id: true,
        farmerId: true,
        endpoint: true,
        ipAddress: true,
        responseCode: true,
        createdAt: true,
      },
    });
  }

  async authenticate(key: string) {
    const prefix = key.split('_').slice(0, 2).join('_');
    const record = await this.prisma.partnerApiKey.findUnique({
      where: { keyPrefix: prefix },
    });
    if (!record?.isActive || !(await bcrypt.compare(key, record.keyHash))) {
      throw new UnauthorizedException('Invalid partner API key');
    }

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.partnerApiRequest.count({
      where: { apiKeyId: record.id, createdAt: { gte: since } },
    });
    if (recent >= HOURLY_REQUEST_LIMIT) {
      throw new HttpException(
        `Partner API rate limit exceeded (${HOURLY_REQUEST_LIMIT}/hour)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.partnerApiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
    return record;
  }

  async creditProfile(apiKeyId: string, farmerId: string, ipAddress?: string) {
    try {
      const profile = await this.farmers.getFormalFinancialProfile(farmerId, {
        id: `partner:${apiKeyId}`,
        role: UserRole.FINANCIAL_PROVIDER,
      });
      await this.prisma.partnerApiRequest.create({
        data: {
          apiKeyId,
          farmerId,
          endpoint: '/partner/v1/farmers/:id/credit-profile',
          ipAddress,
          responseCode: 200,
        },
      });
      return {
        schema: CREDIT_PROFILE_SCHEMA,
        retrievedAt: new Date().toISOString(),
        partnerAccess: {
          apiKeyId,
          audited: true,
        },
        ...profile,
      };
    } catch (error: any) {
      await this.prisma.partnerApiRequest.create({
        data: {
          apiKeyId,
          farmerId,
          endpoint: '/partner/v1/farmers/:id/credit-profile',
          ipAddress,
          responseCode: error?.status ?? error?.getStatus?.() ?? 500,
        },
      });
      throw error;
    }
  }

  /** Public discovery document for partner integrators (no secrets). */
  docs() {
    return {
      name: 'MAYODE Partner API',
      version: 'v1',
      schema: CREDIT_PROFILE_SCHEMA,
      authentication: {
        header: 'X-API-Key',
        format: 'myd_<hex>_<secret>',
        notes: [
          'Keys are issued by MAYODE SUPER_ADMIN/ADMIN and shown once at creation.',
          `Soft rate limit: ${HOURLY_REQUEST_LIMIT} requests per key per hour.`,
        ],
      },
      endpoints: [
        {
          method: 'GET',
          path: '/partner/v1/farmers/:id/credit-profile',
          description:
            'Consent-gated credit profile for a farmer UUID. Requires active X-API-Key. Access is audited in PartnerApiRequest.',
          responseSchema: CREDIT_PROFILE_SCHEMA,
          consentRequired: true,
        },
        {
          method: 'GET',
          path: '/partner/v1/docs',
          description: 'This discovery document.',
          auth: false,
        },
      ],
      creditProfileFields: [
        'schema',
        'retrievedAt',
        'farmer',
        'consent',
        'credit (score, creditReady, factors)',
        'production',
        'finance',
        'farms',
        'conditions',
      ],
    };
  }
}
