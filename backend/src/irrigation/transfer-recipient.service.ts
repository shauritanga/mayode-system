import { ConflictException, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { FarmersService } from '../farmers/farmers.service';
import { FarmerCredentialsService } from '../farmers/farmer-credentials.service';
import { normalizeMsisdn } from '../messaging/sms.service';
import { AllocationService } from './allocation.service';
import type { CreateTransferDto } from './dto/irrigation.dto';

/**
 * The receiving farmer of a transfer is either an existing member (chosen from the list) or someone new, given by name and
 * phone number. A new person is registered as a member of the AMCOS and sent their sign-in details by SMS.
 */
@Injectable()
export class TransferRecipientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly farmers: FarmersService,
    private readonly credentials: FarmerCredentialsService,
    private readonly allocations: AllocationService,
  ) {}

  async createTransfer(actor: RequestUser, dto: CreateTransferDto) {
    if (!dto.newFarmer) {
      if (!dto.toFarmerId) throw new BadRequestException('Choose the receiving member, or enter the name and phone number of a new one');
      return this.allocations.createTransfer(actor, dto);
    }
    if (dto.toFarmerId) throw new BadRequestException('Choose an existing member or enter a new one, not both');
    const firstName = dto.newFarmer.firstName?.trim();
    const lastName = dto.newFarmer.lastName?.trim();
    const rawPhone = dto.newFarmer.phone?.trim();
    if (!firstName || !lastName) throw new BadRequestException('Enter the new member’s first and last name');
    if (!rawPhone || !/^\+?[0-9\s-]{9,15}$/.test(rawPhone)) throw new BadRequestException('Enter a valid phone number for the new member, for example +255712345678');
    const phone = normalizeMsisdn(rawPhone);
    const taken = await this.farmers.checkPhone(phone, actor);
    if (taken.taken) {
      throw new ConflictException((taken as any).member
        ? `This number belongs to ${(taken as any).member.name}, who is already a member. Choose them from the list`
        : 'This phone number is used by another account. Use a different number');
    }

    const password = this.credentials.temporaryPassword();
    const created = await this.farmers.create({ firstName, lastName, phone, password } as any, actor, { mustChangePassword: true });
    let transfer;
    try {
      transfer = await this.allocations.createTransfer(actor, { ...dto, toFarmerId: created.id, newFarmer: undefined });
    } catch (error) {
      // the transfer was refused: do not leave a member behind who was never handed anything
      await this.prisma.$transaction([
        this.prisma.farmer.delete({ where: { id: created.id } }),
        this.prisma.user.delete({ where: { id: created.userId } }),
      ]).catch(() => undefined);
      throw error;
    }
    const sent = await this.credentials.send(phone, firstName, 'sw', password);
    return {
      ...transfer,
      newMember: { id: created.id, name: `${firstName} ${lastName}`, memberNumber: created.controlNumber, credentialsSms: sent ? 'sent' : 'failed', ...(sent ? {} : { temporaryPassword: password }) },
    };
  }
}
