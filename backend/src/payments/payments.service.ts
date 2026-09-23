import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/ownership.service';
import { PaymentType } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return all payment records associated with the logged-in farmer:
   * memberships, tractor services, crop purchase settlements, loan deductions, and escrow payouts.
   */
  async findMyPayments(user: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId: user.id },
      select: { id: true, controlNumber: true },
    });

    if (!farmer) {
      throw new NotFoundException('Farmer profile not found for this account.');
    }

    const payments = await this.prisma.payment.findMany({
      where: { farmerId: farmer.id },
      include: {
        membership: {
          select: {
            id: true,
            status: true,
            plan: { select: { name: true } },
            farmingSeason: { select: { name: true } },
          },
        },
        sale: {
          select: {
            id: true,
            invoiceNumber: true,
            totalRevenue: true,
            fairtradePremium: true,
          },
        },
        loanDeductions: {
          include: {
            loanRecord: {
              select: { lenderName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Also fetch M-LAX Escrow payments where the farmer is the payer
    // (listing renter) or payee (listing owner / payout recipient). Payer and
    // payee live on the LandListing / payoutRecipient fields — EscrowPayment
    // itself only carries the ClickPesa order refs and an optional recipient.
    const escrowPayments = await this.prisma.escrowPayment.findMany({
      where: {
        OR: [
          { payoutRecipientId: farmer.id },
          {
            listing: {
              OR: [{ renterId: farmer.id }, { ownerId: farmer.id }],
            },
          },
        ],
      },
      include: {
        listing: {
          select: {
            id: true,
            askingPrice: true,
            dealType: true,
            renterId: true,
            ownerId: true,
            farm: { select: { farmCode: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalOutflow = payments
      .filter((p) => p.paymentType === PaymentType.MEMBERSHIP || p.paymentType === PaymentType.TRACTOR_SERVICE)
      .reduce((sum, p) => sum + p.amount, 0);

    const totalInflow = payments
      .filter((p) => p.paymentType === PaymentType.RICE_PURCHASE)
      .reduce((sum, p) => sum + (p.netAmount ?? p.amount), 0);

    const totalDeductions = payments.reduce(
      (sum, p) => sum + (p.loanDeduction ?? 0),
      0,
    );

    // Payment amounts are stored in TZS and carry no currency/method columns;
    // the channel is derived from which reference is present (ClickPesa order
    // ref vs M-Pesa receipt).
    const transactions = [
      ...payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: 'TZS',
        type: p.paymentType as string,
        status: p.status as string,
        paymentMethod: p.mpesaRef
          ? 'M-PESA'
          : p.orderReference
            ? 'CLICKPESA'
            : undefined,
        reference: p.orderReference || p.mpesaRef || undefined,
        notes: p.description || undefined,
        createdAt: p.createdAt.toISOString(),
      })),
      ...escrowPayments.map((e) => ({
        id: e.id,
        amount: e.amount,
        currency: 'TZS',
        type:
          e.listing?.renterId === farmer.id
            ? 'ESCROW_DEPOSIT'
            : 'ESCROW_PAYOUT',
        status: e.status as string,
        paymentMethod: 'ESCROW',
        reference:
          e.orderReference || e.mpesaRef || e.id.slice(0, 8),
        notes: `Escrow for farm ${e.listing?.farm?.farmCode || 'Plot'}`,
        createdAt: e.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalReceived = totalInflow;
    const totalPaid = totalOutflow;
    const netBalance = totalReceived - totalPaid;

    return {
      farmerId: farmer.id,
      controlNumber: farmer.controlNumber,
      summary: {
        totalInflow,
        totalOutflow,
        totalDeductions,
        totalReceived,
        totalPaid,
        netBalance,
        count: transactions.length,
        recordCount: transactions.length,
      },
      transactions,
      payments,
      escrowPayments,
    };
  }
}
