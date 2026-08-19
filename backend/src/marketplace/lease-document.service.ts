import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../uploads/storage.service';

/**
 * Generates the M-LAX digital lease agreement: a PDF with the listing/party/
 * date/price terms plus an embedded QR code encoding a verification URL.
 * Replaces the manual `agreementDocumentUrl` upload used elsewhere in the
 * system — for M-LAX leases this is generated automatically the moment
 * escrow is released and the lease goes ACTIVE.
 */
@Injectable()
export class LeaseDocumentService {
  private readonly logger = new Logger(LeaseDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_BASE_URL') || 'http://localhost:3001'
    );
  }

  async generateAgreement(listingId: string): Promise<string | null> {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: {
        farm: true,
        owner: true,
        renter: true,
      },
    });
    if (!listing || !listing.renter) return null;
    const renter = listing.renter;

    const verificationUrl = `${this.baseUrl}/verify/lease/${listing.id}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
      margin: 1,
      width: 200,
    });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    const filename = `lease-agreement-${listing.id}-${randomUUID()}.pdf`;
    const filePath = path.join(this.storage.uploadDir, filename);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('MAYODE M-LAX Digital Lease Agreement', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Agreement ID: ${listing.id}`, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, {
        align: 'center',
      });
      doc.moveDown(2);

      doc.fontSize(13).font('Helvetica-Bold').text('Farm');
      doc.fontSize(11).font('Helvetica').text(`Code: ${listing.farm.farmCode}`);
      doc.text(`Grade: ${listing.farm.grade}`);
      doc.text(`Social Hectares: ${listing.farm.socialHectares}`);
      doc.moveDown();

      doc.fontSize(13).font('Helvetica-Bold').text('Owner (Landlord)');
      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `${listing.owner.firstName} ${listing.owner.lastName} (${listing.owner.controlNumber})`,
        );
      doc.moveDown();

      doc.fontSize(13).font('Helvetica-Bold').text('Renter (Tenant)');
      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `${renter.firstName} ${renter.lastName} (${renter.controlNumber})`,
        );
      doc.moveDown();

      doc.fontSize(13).font('Helvetica-Bold').text('Terms');
      doc.fontSize(11).font('Helvetica');
      doc.text(`Deal type: ${listing.dealType}`);
      doc.text(
        `Agreed price: ${(listing.finalPrice ?? listing.askingPrice).toLocaleString()} TZS`,
      );
      doc.text(
        `MAYODE commission: ${(listing.commissionAmount ?? 0).toLocaleString()} TZS`,
      );
      doc.text(`Duration: ${listing.leaseDurationMonths} month(s)`);
      if (listing.leaseStartDate)
        doc.text(
          `Start date: ${listing.leaseStartDate.toLocaleDateString('en-GB')}`,
        );
      if (listing.leaseEndDate)
        doc.text(
          `End date: ${listing.leaseEndDate.toLocaleDateString('en-GB')}`,
        );
      doc.moveDown();

      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .text(
          'This lease follows the land, not the person: if the farm changes ownership during the lease term, the new owner must honour these terms until the end date. Disputes are handled through MAYODE and the local MAMCOS office.',
          { width: 495 },
        );
      doc.moveDown(2);

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Scan to verify this agreement:');
      doc.image(qrBuffer, { width: 120 });

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    const url = this.storage.publicUrl(filename);
    await this.prisma.landListing.update({
      where: { id: listing.id },
      data: { agreementPdfUrl: url, agreementGeneratedAt: new Date() },
    });

    this.logger.log(
      `Generated lease agreement for listing ${listing.id} at ${url}`,
    );
    return url;
  }
}
