import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { ExportService } from '../common/export.service';
import { CatalogService } from './catalog.service';
import { StockService } from './stock.service';
import { ReceivingService } from './receiving.service';
import { ProcessingService } from './processing.service';
import { TraceabilityService } from './traceability.service';
import { SalesOpsService } from './sales-ops.service';
import { BillingService } from './billing.service';
import { DispatchService } from './dispatch.service';
import { DocumentsService } from './documents.service';
import { FarmOpsService } from './farm-ops.service';
import { FarmTasksService } from './farm-tasks.service';
import { FarmInputsService } from './farm-inputs.service';
import { HarvestService } from './harvest.service';
import { OpsReportsService } from './ops-reports.service';
import { UpsertCustomerDto, UpsertProductDto } from './dto/catalog.dto';
import { AdjustStockDto, CreateReceiptDto, CreateRunDto, ReasonDto, ReceiveTransferDto, TransferDto } from './dto/warehouse.dto';
import { AllocateDto, AuthorizeDto, ControlNumberDto, CreateOrderDto, CreateQuotationDto, DeliveryDto, IssueInvoiceDto, MobilePaymentDto, PrepareDispatchDto, RecordPaymentDto, ReviewOrderDto, ShortageDto, UpdateOrderDto } from './dto/commercial.dto';
import { AdjustInputDto, CheckInDto, CreateHarvestDto, CreateInspectionDto, CreateMayodeFarmDto, CreateTaskDto, NewCropCycleDto, NewPlotDto, ReviewTaskDto, StartWithoutGpsDto, StockInDto, SubmitInspectionDto, SubmitReportDto, TransportDto, UpsertFarmDto, UpsertInputItemDto } from './dto/farm.dto';

const guards = () => UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard);
type U = RequestUser;

function sendFile(res: Response, file: { pdf: Buffer; name: string }, inline = true) {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${file.name}"` });
  res.send(file.pdf);
}

// =================== catalogue and customers ===================

@ApiTags('ops-catalog')
@ApiBearerAuth()
@guards()
@Controller('ops')
export class OpsCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products') @RequirePermission('ops_catalog', 'VIEW')
  products(@CurrentUser() u: U, @Query() q: { category?: string; active?: string; q?: string }) { return this.catalog.products(u, q); }
  @Post('products') @RequirePermission('ops_catalog', 'CREATE')
  createProduct(@Body() dto: UpsertProductDto, @CurrentUser() u: U) { return this.catalog.createProduct(dto, u); }
  @Patch('products/:id') @RequirePermission('ops_catalog', 'EDIT')
  updateProduct(@Param('id') id: string, @Body() dto: UpsertProductDto, @CurrentUser() u: U) { return this.catalog.updateProduct(id, dto, u); }

  @Get('customers') @RequirePermission('ops_customers', 'VIEW')
  customers(@CurrentUser() u: U, @Query() q: { q?: string; type?: string; active?: string }) { return this.catalog.customers(u, q); }
  @Post('customers') @RequirePermission('ops_customers', 'CREATE')
  createCustomer(@Body() dto: UpsertCustomerDto, @CurrentUser() u: U) { return this.catalog.createCustomer(dto, u); }
  @Get('customers/:id') @RequirePermission('ops_customers', 'VIEW')
  customer(@Param('id') id: string, @CurrentUser() u: U) { return this.catalog.customer(id, u); }
  @Patch('customers/:id') @RequirePermission('ops_customers', 'EDIT')
  updateCustomer(@Param('id') id: string, @Body() dto: UpsertCustomerDto, @CurrentUser() u: U) { return this.catalog.updateCustomer(id, dto, u); }
}

// =================== warehouse ===================

@ApiTags('ops-warehouse')
@ApiBearerAuth()
@guards()
@Controller('ops/warehouse')
export class OpsWarehouseController {
  constructor(
    private readonly receiving: ReceivingService,
    private readonly stock: StockService,
    private readonly processing: ProcessingService,
    private readonly trace: TraceabilityService,
    private readonly farm: FarmOpsService,
  ) {}

  // lookups used by the receiving screen
  @Get('lookups') @RequirePermission('ops_receiving', 'VIEW')
  lookups(@CurrentUser() u: U) { return this.farm.lookups(u); }
  @Get('farmers') @RequirePermission('ops_receiving', 'VIEW')
  farmers(@CurrentUser() u: U, @Query('q') q = '') { return this.farm.searchFarmers(u, q); }
  @Get('farmers/:id/records') @RequirePermission('ops_receiving', 'VIEW')
  farmerRecords(@Param('id') id: string, @CurrentUser() u: U) { return this.farm.farmerRecords(id, u); }
  @Get('harvest-options') @RequirePermission('ops_receiving', 'VIEW')
  harvestOptions(@CurrentUser() u: U, @Query('farmId') farmId?: string) { return this.farm.harvestOptions(u, { farmId }); }

  @Get('receipts') @RequirePermission('ops_receiving', 'VIEW')
  receipts(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.receiving.list(u, q); }
  @Post('receipts') @RequirePermission('ops_receiving', 'CREATE')
  createReceipt(@Body() dto: CreateReceiptDto, @CurrentUser() u: U) { return this.receiving.create(dto, u); }
  @Get('receipts/:id') @RequirePermission('ops_receiving', 'VIEW')
  receipt(@Param('id') id: string, @CurrentUser() u: U) { return this.receiving.detail(id, u); }
  @Post('receipts/:id/confirm') @RequirePermission('ops_receiving', 'EDIT')
  confirmReceipt(@Param('id') id: string, @CurrentUser() u: U) { return this.receiving.confirm(id, u); }
  @Post('receipts/:id/cancel') @RequirePermission('ops_receiving', 'DELETE')
  cancelReceipt(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.receiving.cancel(id, dto.reason, u); }

  @Get('stock/batches') @RequirePermission('ops_stock', 'VIEW')
  batches(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.stock.batches(u, q); }
  @Get('stock/position') @RequirePermission('ops_stock', 'VIEW')
  position(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.stock.position(u, q); }
  @Get('stock/summary') @RequirePermission('ops_stock', 'VIEW')
  summary(@CurrentUser() u: U) { return this.stock.summary(u); }
  @Get('stock/ledger') @RequirePermission('ops_stock', 'VIEW')
  ledger(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.stock.ledger(u, q); }
  @Post('stock/adjust') @RequirePermission('ops_stock', 'EDIT')
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() u: U) { return this.stock.adjust(dto, u); }
  @Post('stock/ledger/:id/reverse') @RequirePermission('ops_stock', 'EDIT')
  reverse(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.stock.reverse(id, dto.reason, u); }
  @Get('stock/transfers') @RequirePermission('ops_stock', 'VIEW')
  transfers(@CurrentUser() u: U) { return this.stock.transfers(u); }
  @Post('stock/transfers') @RequirePermission('ops_stock', 'EDIT')
  sendTransfer(@Body() dto: TransferDto, @CurrentUser() u: U) { return this.stock.sendTransfer(dto, u); }
  @Post('stock/transfers/:id/receive') @RequirePermission('ops_stock', 'EDIT')
  receiveTransfer(@Param('id') id: string, @Body() dto: ReceiveTransferDto, @CurrentUser() u: U) { return this.stock.receiveTransfer(id, dto, u); }
  @Post('stock/transfers/:id/cancel') @RequirePermission('ops_stock', 'EDIT')
  cancelTransfer(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.stock.cancelTransfer(id, dto.reason, u); }

  @Get('processing') @RequirePermission('ops_processing', 'VIEW')
  runs(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.processing.list(u, q); }
  @Get('processing/yield') @RequirePermission('ops_processing', 'VIEW')
  yieldReport(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.processing.yieldReport(u, q); }
  @Post('processing') @RequirePermission('ops_processing', 'CREATE')
  createRun(@Body() dto: CreateRunDto, @CurrentUser() u: U) { return this.processing.create(dto, u); }
  @Get('processing/:id') @RequirePermission('ops_processing', 'VIEW')
  run(@Param('id') id: string, @CurrentUser() u: U) { return this.processing.detail(id, u); }
  @Post('processing/:id/reverse') @RequirePermission('ops_processing', 'DELETE')
  reverseRun(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.processing.reverse(id, dto.reason, u); }

  @Get('trace') @RequirePermission('ops_stock', 'VIEW')
  @ApiOperation({ summary: 'Backward and forward trace from any batch, receipt, run, dispatch, release note or order reference' })
  async traceRef(@Query('ref') ref: string, @CurrentUser() u: U) {
    const ids = await this.trace.search(ref, u);
    return Promise.all(ids.slice(0, 5).map(async (batchId) => ({ batchId, backward: await this.trace.backward(batchId, u), forward: await this.trace.forward(batchId, u) })));
  }
  @Get('trace/batches/:id') @RequirePermission('ops_stock', 'VIEW')
  async traceBatch(@Param('id') id: string, @CurrentUser() u: U) { return { batchId: id, backward: await this.trace.backward(id, u), forward: await this.trace.forward(id, u) }; }
}

// =================== quotations, orders, billing ===================

@ApiTags('ops-sales')
@ApiBearerAuth()
@guards()
@Controller('ops/sales')
export class OpsSalesController {
  constructor(private readonly sales: SalesOpsService) {}

  @Get('availability') @RequirePermission('ops_orders', 'VIEW')
  async availability(@CurrentUser() u: U, @Query('productIds') ids = '') {
    const map = await this.sales.availability(u, ids.split(',').filter(Boolean));
    return Object.fromEntries(map);
  }
  @Get('quotations') @RequirePermission('ops_orders', 'VIEW')
  quotations(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.sales.quotations(u, q); }
  @Post('quotations') @RequirePermission('ops_orders', 'CREATE')
  createQuotation(@Body() dto: CreateQuotationDto, @CurrentUser() u: U) { return this.sales.createQuotation(dto, u); }
  @Get('quotations/:id') @RequirePermission('ops_orders', 'VIEW')
  quotation(@Param('id') id: string, @CurrentUser() u: U) { return this.sales.quotation(id, u); }
  @Patch('quotations/:id') @RequirePermission('ops_orders', 'EDIT')
  updateQuotation(@Param('id') id: string, @Body() dto: CreateQuotationDto, @CurrentUser() u: U) { return this.sales.updateQuotation(id, dto, u); }
  @Post('quotations/:id/status') @RequirePermission('ops_orders', 'EDIT')
  quotationStatus(@Param('id') id: string, @Body('status') status: 'SENT' | 'ACCEPTED' | 'CANCELLED', @CurrentUser() u: U) { return this.sales.setQuotationStatus(id, status, u); }

  @Get('orders') @RequirePermission('ops_orders', 'VIEW')
  orders(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.sales.list(u, q); }
  @Post('orders') @RequirePermission('ops_orders', 'CREATE')
  createOrder(@Body() dto: CreateOrderDto, @CurrentUser() u: U) { return this.sales.createOrder(dto, u); }
  @Get('orders/:id') @RequirePermission('ops_orders', 'VIEW')
  order(@Param('id') id: string, @CurrentUser() u: U) { return this.sales.order(id, u); }
  @Patch('orders/:id') @RequirePermission('ops_orders', 'EDIT')
  updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() u: U) { return this.sales.updateOrder(id, dto, u); }
  @Post('orders/:id/resubmit') @RequirePermission('ops_orders', 'EDIT')
  resubmit(@Param('id') id: string, @CurrentUser() u: U) { return this.sales.resubmit(id, u); }
  @Post('orders/:id/cancel') @RequirePermission('ops_orders', 'EDIT')
  cancel(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.sales.cancel(id, dto.reason, u); }
  @Post('orders/:id/review') @RequirePermission('ops_review', 'EDIT')
  review(@Param('id') id: string, @Body() dto: ReviewOrderDto, @CurrentUser() u: U) { return this.sales.review(id, dto, u); }
}

@ApiTags('ops-billing')
@ApiBearerAuth()
@guards()
@Controller('ops/billing')
export class OpsBillingController {
  constructor(private readonly billing: BillingService, private readonly docs: DocumentsService) {}

  @Get('invoices') @RequirePermission('ops_orders', 'VIEW')
  invoices(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.billing.invoices(u, q); }
  @Get('invoices/:id') @RequirePermission('ops_orders', 'VIEW')
  invoice(@Param('id') id: string, @CurrentUser() u: U) { return this.billing.invoice(id, u); }
  @Get('invoices/:id/pdf') @RequirePermission('ops_orders', 'VIEW')
  async invoicePdf(@Param('id') id: string, @CurrentUser() u: U, @Res() res: Response) { sendFile(res, await this.docs.invoicePdf(id, u)); }
  @Post('invoices/:id/shared') @RequirePermission('ops_orders', 'EDIT')
  shared(@Param('id') id: string, @CurrentUser() u: U) { return this.billing.markShared(id, u); }
  @Post('orders/:id/invoice') @RequirePermission('ops_review', 'CREATE')
  issue(@Param('id') id: string, @Body() dto: IssueInvoiceDto, @CurrentUser() u: U) { return this.billing.issueInvoice(id, dto, u); }
  @Post('invoices/:id/void') @RequirePermission('ops_review', 'EDIT')
  void(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.billing.voidInvoice(id, dto.reason, u); }

  @Post('invoices/:id/control-number') @RequirePermission('ops_payments', 'CREATE')
  setControl(@Param('id') id: string, @Body() dto: ControlNumberDto, @CurrentUser() u: U) { return this.billing.setControlNumber(id, dto, u); }
  @Post('invoices/:id/control-number/request') @RequirePermission('ops_payments', 'CREATE')
  requestControl(@Param('id') id: string, @CurrentUser() u: U) { return this.billing.requestControlNumber(id, u); }

  @Get('payments') @RequirePermission('ops_payments', 'VIEW')
  payments(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.billing.payments(u, q); }
  @Post('invoices/:id/payments') @RequirePermission('ops_payments', 'CREATE')
  record(@Param('id') id: string, @Body() dto: RecordPaymentDto, @CurrentUser() u: U) { return this.billing.recordPayment(id, dto, u); }
  @Post('invoices/:id/mobile-payment') @RequirePermission('ops_payments', 'CREATE')
  mobile(@Param('id') id: string, @Body() dto: MobilePaymentDto, @CurrentUser() u: U) { return this.billing.initiateMobilePayment(id, dto, u); }
  @Post('payments/:id/reconcile') @RequirePermission('ops_payments', 'CREATE')
  reconcile(@Param('id') id: string, @CurrentUser() u: U) { return this.billing.reconcile(id, u); }
  @Post('payments/:id/confirm') @RequirePermission('ops_payments', 'EDIT')
  confirm(@Param('id') id: string, @CurrentUser() u: U) { return this.billing.confirmPending(id, u); }
  @Post('payments/:id/reject') @RequirePermission('ops_payments', 'EDIT')
  reject(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.billing.rejectPending(id, dto.reason, u); }

  @Post('orders/:id/authorize') @RequirePermission('ops_payments', 'EDIT')
  authorize(@Param('id') id: string, @Body() dto: AuthorizeDto, @CurrentUser() u: U) { return this.billing.authorize(id, dto, u); }
  @Post('orders/:id/revoke') @RequirePermission('ops_payments', 'EDIT')
  revoke(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.billing.revokeAuthorization(id, dto.reason, u); }
}

/** No login: signed provider callbacks, and the release-note link given to customers. */
@ApiTags('ops-public')
@Controller('ops/public')
export class OpsPublicController {
  constructor(private readonly billing: BillingService, private readonly docs: DocumentsService) {}

  @Post('payment-callback') @HttpCode(200)
  callback(@Body() body: Record<string, never>, @Headers('x-signature') signature?: string) { return this.billing.handleCallback(body as never, signature); }

  @Get('release-note/:token')
  @Header('Cache-Control', 'private, no-store')
  async releaseNote(@Param('token') token: string, @Res() res: Response) { sendFile(res, await this.docs.publicReleaseNotePdf(token)); }
}

// =================== dispatch ===================

@ApiTags('ops-dispatch')
@ApiBearerAuth()
@guards()
@Controller('ops/dispatch')
export class OpsDispatchController {
  constructor(private readonly dispatch: DispatchService, private readonly docs: DocumentsService, private readonly config: ConfigService) {}

  @Get('queue') @RequirePermission('ops_dispatch', 'VIEW')
  queue(@CurrentUser() u: U) { return this.dispatch.queue(u); }
  @Get('orders/:id') @RequirePermission('ops_dispatch', 'VIEW')
  view(@Param('id') id: string, @CurrentUser() u: U) { return this.dispatch.prepareView(id, u); }
  @Post('orders/:id/allocate') @RequirePermission('ops_dispatch', 'CREATE')
  allocate(@Param('id') id: string, @Body() dto: AllocateDto, @CurrentUser() u: U) { return this.dispatch.allocate(id, dto, u); }
  @Post('allocations/:id/release') @RequirePermission('ops_dispatch', 'CREATE')
  releaseAllocation(@Param('id') id: string, @CurrentUser() u: U) { return this.dispatch.releaseAllocation(id, u); }
  @Post('orders/:id/shortage') @RequirePermission('ops_dispatch', 'CREATE')
  shortage(@Param('id') id: string, @Body() dto: ShortageDto, @CurrentUser() u: U) { return this.dispatch.reportShortage(id, dto.note, u); }
  @Post('orders/:id/close-short') @RequirePermission('ops_payments', 'EDIT')
  closeShort(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.dispatch.closeShort(id, dto.reason, u); }
  @Post('orders/:id/prepare') @RequirePermission('ops_dispatch', 'CREATE')
  prepare(@Param('id') id: string, @Body() dto: PrepareDispatchDto, @CurrentUser() u: U) { return this.dispatch.prepare(id, dto, u); }

  @Get('dispatches') @RequirePermission('ops_dispatch', 'VIEW')
  list(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.dispatch.dispatches(u, q); }
  @Get('dispatches/:id') @RequirePermission('ops_dispatch', 'VIEW')
  one(@Param('id') id: string, @CurrentUser() u: U) { return this.dispatch.dispatch(id, u); }
  @Post('dispatches/:id/release') @RequirePermission('ops_dispatch', 'EDIT')
  release(@Param('id') id: string, @CurrentUser() u: U) { return this.dispatch.release(id, u); }
  @Post('dispatches/:id/cancel') @RequirePermission('ops_dispatch', 'DELETE')
  cancel(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.dispatch.cancel(id, dto.reason, u); }
  @Post('dispatches/:id/delivery') @RequirePermission('ops_dispatch', 'EDIT')
  delivery(@Param('id') id: string, @Body() dto: DeliveryDto, @CurrentUser() u: U) { return this.dispatch.delivery(id, dto, u); }

  @Get('dispatches/:id/release-note.pdf') @RequirePermission('ops_dispatch', 'VIEW')
  async pdf(@Param('id') id: string, @Query('download') download: string, @CurrentUser() u: U, @Res() res: Response) { sendFile(res, await this.docs.releaseNotePdf(id, u), download !== 'true'); }

  /** The customer link and a ready WhatsApp message. The link opens the saved release note without a login. */
  @Get('dispatches/:id/share') @RequirePermission('ops_dispatch', 'VIEW')
  async share(@Param('id') id: string, @CurrentUser() u: U) {
    const d = await this.dispatch.dispatch(id, u);
    const base = (this.config.get<string>('PUBLIC_API_URL') || 'https://api.mayodegroup.com/api/v1').replace(/\/$/, '');
    const url = `${base}/ops/public/release-note/${d.shareToken}`;
    const phone = d.order.customer.phone.replace(/[^0-9]/g, '').replace(/^0/, '255');
    const text = `Goods release note ${d.releaseNoteNumber} for order ${d.order.reference}${d.status === 'RELEASED' ? '' : ' (not yet released)'}: ${url}`;
    return { url, releaseNote: d.releaseNoteNumber, whatsappLink: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, released: d.status === 'RELEASED' };
  }
}

// =================== Mayode farms ===================

@ApiTags('ops-farm')
@ApiBearerAuth()
@guards()
@Controller('ops/farm')
export class OpsFarmController {
  constructor(
    private readonly farms: FarmOpsService,
    private readonly tasks: FarmTasksService,
    private readonly inputs: FarmInputsService,
    private readonly harvests: HarvestService,
  ) {}

  @Get('farms') @RequirePermission('ops_farm_tasks', 'VIEW')
  listFarms(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.farms.farms(u, q); }
  @Post('farms') @RequirePermission('ops_farm_tasks', 'CREATE')
  createFarm(@Body() dto: CreateMayodeFarmDto, @CurrentUser() u: U) { return this.farms.createFarm(dto, u); }
  @Get('farms/:id') @RequirePermission('ops_farm_tasks', 'VIEW')
  farm(@Param('id') id: string, @CurrentUser() u: U) { return this.farms.farm(id, u); }
  @Patch('farms/:id') @RequirePermission('ops_farm_tasks', 'EDIT')
  updateFarm(@Param('id') id: string, @Body() dto: UpsertFarmDto, @CurrentUser() u: U) { return this.farms.updateFarm(id, dto, u); }
  @Post('farms/:id/plots') @RequirePermission('ops_farm_tasks', 'CREATE')
  addPlot(@Param('id') id: string, @Body() dto: NewPlotDto, @CurrentUser() u: U) { return this.farms.addPlot(id, dto, u); }
  @Post('crop-cycles') @RequirePermission('ops_farm_tasks', 'CREATE')
  newCycle(@Body() dto: NewCropCycleDto, @CurrentUser() u: U) { return this.farms.newCropCycle(dto, u); }
  @Get('assignees') @RequirePermission('ops_farm_tasks', 'VIEW')
  assignees(@CurrentUser() u: U) { return this.farms.assignees(u); }

  @Get('tasks') @RequirePermission('ops_farm_tasks', 'VIEW')
  list(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.tasks.list(u, q); }
  @Post('tasks') @RequirePermission('ops_farm_tasks', 'CREATE')
  create(@Body() dto: CreateTaskDto, @CurrentUser() u: U) { return this.tasks.createTask(dto, u); }
  @Post('inspections') @RequirePermission('ops_farm_tasks', 'CREATE')
  createInspection(@Body() dto: CreateInspectionDto, @CurrentUser() u: U) { return this.tasks.createInspection(dto, u); }
  @Get('tasks/:id') @RequirePermission('ops_farm_tasks', 'VIEW')
  detail(@Param('id') id: string, @CurrentUser() u: U) { return this.tasks.detail(id, u); }
  @Post('tasks/:id/cancel') @RequirePermission('ops_farm_tasks', 'EDIT')
  cancel(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: U) { return this.tasks.cancel(id, dto.reason, u); }
  @Post('tasks/:id/review') @RequirePermission('ops_farm_review', 'EDIT')
  review(@Param('id') id: string, @Body() dto: ReviewTaskDto, @CurrentUser() u: U) { return this.tasks.review(id, dto, u); }
  @Get('attendance') @RequirePermission('ops_farm_tasks', 'VIEW')
  attendance(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.tasks.attendance(u, q); }
  @Get('employee-summary') @RequirePermission('ops_farm_tasks', 'VIEW')
  employees(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.tasks.employeeSummary(u, q); }

  // the worker's own work
  @Get('my-tasks') @RequirePermission('ops_field_work', 'VIEW')
  mine(@CurrentUser() u: U, @Query('status') status?: string) { return this.tasks.mine(u, { status }); }
  @Get('my-tasks/inputs') @RequirePermission('ops_field_work', 'VIEW')
  myInputs(@CurrentUser() u: U) { return this.inputs.items(u); }
  @Get('my-tasks/:id') @RequirePermission('ops_field_work', 'VIEW')
  mineOne(@Param('id') id: string, @CurrentUser() u: U) { return this.tasks.detail(id, { id: u.id, role: 'CUSTOM' as never, mamcosId: '__none__' }, u); }
  @Post('my-tasks/:id/acknowledge') @RequirePermission('ops_field_work', 'EDIT')
  acknowledge(@Param('id') id: string, @CurrentUser() u: U) { return this.tasks.acknowledge(id, u); }
  @Post('my-tasks/:id/check-in') @RequirePermission('ops_field_work', 'CREATE')
  checkIn(@Param('id') id: string, @Body() dto: CheckInDto, @CurrentUser() u: U) { return this.tasks.checkIn(id, dto, u); }
  @Post('my-tasks/:id/start-without-gps') @RequirePermission('ops_field_work', 'CREATE')
  startNoGps(@Param('id') id: string, @Body() dto: StartWithoutGpsDto, @CurrentUser() u: U) { return this.tasks.startWithoutGps(id, dto, u); }
  @Post('my-tasks/:id/report') @RequirePermission('ops_field_work', 'CREATE')
  report(@Param('id') id: string, @Body() dto: SubmitReportDto, @CurrentUser() u: U) { return this.tasks.submitReport(id, dto, u); }
  @Post('my-tasks/:id/inspection') @RequirePermission('ops_field_work', 'CREATE')
  inspection(@Param('id') id: string, @Body() dto: SubmitInspectionDto, @CurrentUser() u: U) { return this.tasks.submitInspection(id, dto, u); }

  @Get('inputs') @RequirePermission('ops_farm_inputs', 'VIEW')
  items(@CurrentUser() u: U) { return this.inputs.items(u); }
  @Post('inputs') @RequirePermission('ops_farm_inputs', 'CREATE')
  createItem(@Body() dto: UpsertInputItemDto, @CurrentUser() u: U) { return this.inputs.create(dto, u); }
  @Patch('inputs/:id') @RequirePermission('ops_farm_inputs', 'EDIT')
  updateItem(@Param('id') id: string, @Body() dto: UpsertInputItemDto, @CurrentUser() u: U) { return this.inputs.update(id, dto, u); }
  @Post('inputs/:id/stock-in') @RequirePermission('ops_farm_inputs', 'EDIT')
  stockIn(@Param('id') id: string, @Body() dto: StockInDto, @CurrentUser() u: U) { return this.inputs.stockIn(id, dto, u); }
  @Post('inputs/:id/adjust') @RequirePermission('ops_farm_inputs', 'EDIT')
  adjust(@Param('id') id: string, @Body() dto: AdjustInputDto, @CurrentUser() u: U) { return this.inputs.adjust(id, dto, u); }
  @Get('input-movements') @RequirePermission('ops_farm_inputs', 'VIEW')
  movements(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.inputs.movements(u, q); }

  @Get('harvests') @RequirePermission('ops_harvest', 'VIEW')
  harvestList(@CurrentUser() u: U, @Query() q: Record<string, string>) { return this.harvests.list(u, q); }
  @Post('harvests') @RequirePermission('ops_harvest', 'CREATE')
  createHarvest(@Body() dto: CreateHarvestDto, @CurrentUser() u: U) { return this.harvests.create(dto, u); }
  @Get('harvests/:id') @RequirePermission('ops_harvest', 'VIEW')
  harvest(@Param('id') id: string, @CurrentUser() u: U) { return this.harvests.detail(id, u); }
  @Post('harvests/:id/transport') @RequirePermission('ops_harvest', 'EDIT')
  transport(@Param('id') id: string, @Body() dto: TransportDto, @CurrentUser() u: U) { return this.harvests.declareTransport(id, dto, u); }
  @Post('harvests/:id/close') @RequirePermission('ops_harvest', 'EDIT')
  closeHarvest(@Param('id') id: string, @CurrentUser() u: U) { return this.harvests.close(id, u); }
}

// =================== dashboards, reports, setup ===================

@ApiTags('ops-reports')
@ApiBearerAuth()
@guards()
@Controller('ops/reports')
export class OpsReportsController {
  constructor(private readonly reports: OpsReportsService, private readonly exporter: ExportService) {}

  @Get('catalog') @RequirePermission('ops_reports', 'VIEW')
  catalog() { return this.reports.catalog(); }
  @Get('dashboard/commercial') @RequirePermission('ops_reports', 'VIEW')
  commercial(@CurrentUser() u: U, @Query('from') from?: string, @Query('to') to?: string) { return this.reports.commercial(u, { from, to }); }
  @Get('dashboard/farm') @RequirePermission('ops_reports', 'VIEW')
  farm(@CurrentUser() u: U, @Query('from') from?: string, @Query('to') to?: string) { return this.reports.farm(u, { from, to }); }

  @Get('run/:key') @RequirePermission('ops_reports', 'VIEW')
  async run(@Param('key') key: string, @CurrentUser() u: U, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const { title, rows } = await this.reports.run(key, u, q);
    const format = q.format;
    if (!format || format === 'json') return { title, rows };
    if (format === 'csv') { res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${key}.csv"` }); return res.send(this.exporter.csv(rows)); }
    if (format === 'pdf') { res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${key}.pdf"` }); return res.send(await this.exporter.pdf(rows, title)); }
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${key}.xlsx"` });
    return res.send(this.exporter.xlsx(rows, title));
  }
}

export { Delete };
