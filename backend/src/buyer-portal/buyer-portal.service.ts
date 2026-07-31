import { Injectable } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { SalesService } from '../sales/sales.service';

@Injectable()
export class BuyerPortalService {
  constructor(private readonly reports: ReportsService, private readonly sales: SalesService) {}
  profile() { return { name: 'MAYODE Youth Development Group', location: 'Mbarali, Mbeya, Tanzania', focus: 'Rice production, traceability, and Fairtrade cooperative development' }; }
  dashboard() { return this.reports.kpis(); }
  async traceability(reference: string) {
    const trace = await this.sales.traceability(reference);
    return {
      invoiceNumber: trace.invoiceNumber, saleDate: trace.saleDate, paymentReceived: trace.paymentReceived,
      buyer: trace.buyer, lot: trace.lot,
      // Buyer view intentionally omits names, phone numbers and precise farmer locations.
      sourceRecords: trace.sourceRecords.map((record) => ({ trackingCode: record.trackingCode, receivedDate: record.receivedDate, weightKg: record.weightKg, qualityGrade: record.qualityGrade, farmCode: record.farm.farmCode, district: record.farm.district, region: record.farm.region })),
    };
  }
}
