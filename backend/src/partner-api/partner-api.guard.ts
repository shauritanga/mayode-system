import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PartnerApiService } from './partner-api.service';
@Injectable() export class PartnerApiGuard implements CanActivate { constructor(private readonly partners: PartnerApiService) {} async canActivate(context: ExecutionContext) { const request = context.switchToHttp().getRequest(); const key = request.headers['x-api-key']; if (typeof key !== 'string') throw new UnauthorizedException('X-API-Key is required'); request.partnerApiKey = await this.partners.authenticate(key); return true; } }
