import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FarmersService } from '../farmers/farmers.service';

@Injectable()
export class PartnerApiService {
  constructor(private readonly prisma: PrismaService, private readonly farmers: FarmersService) {}
  async createKey(partnerName: string) {
    const secret = randomBytes(32).toString('base64url');
    const prefix = `myd_${randomBytes(4).toString('hex')}`;
    const key = `${prefix}_${secret}`;
    const record = await this.prisma.partnerApiKey.create({ data: { partnerName, keyPrefix: prefix, keyHash: await bcrypt.hash(key, 12) } });
    return { id: record.id, partnerName, apiKey: key, warning: 'Store this key now; it cannot be retrieved again.' };
  }
  async authenticate(key: string) {
    const prefix = key.split('_').slice(0, 2).join('_');
    const record = await this.prisma.partnerApiKey.findUnique({ where: { keyPrefix: prefix } });
    if (!record?.isActive || !(await bcrypt.compare(key, record.keyHash))) throw new UnauthorizedException('Invalid partner API key');
    await this.prisma.partnerApiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
    return record;
  }
  async creditProfile(apiKeyId: string, farmerId: string, ipAddress?: string) {
    try {
      const profile = await this.farmers.getFormalFinancialProfile(farmerId, { id: `partner:${apiKeyId}`, role: UserRole.FINANCIAL_PROVIDER });
      await this.prisma.partnerApiRequest.create({ data: { apiKeyId, farmerId, endpoint: '/partner/v1/farmers/:id/credit-profile', ipAddress, responseCode: 200 } });
      return profile;
    } catch (error) {
      await this.prisma.partnerApiRequest.create({ data: { apiKeyId, farmerId, endpoint: '/partner/v1/farmers/:id/credit-profile', ipAddress, responseCode: (error as any)?.status ?? 500 } });
      throw error;
    }
  }
}
