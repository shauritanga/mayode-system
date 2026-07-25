import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FarmersModule } from './farmers/farmers.module';
import { MamcosModule } from './mamcos/mamcos.module';
import { FarmsModule } from './farms/farms.module';
import { PlotsModule } from './plots/plots.module';
import { FarmVerificationsModule } from './farm-verifications/farm-verifications.module';
import { CropCyclesModule } from './crop-cycles/crop-cycles.module';
import { FinanceModule } from './finance/finance.module';
import { InventoryModule } from './inventory/inventory.module';
import { LocationsModule } from './locations/locations.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { UploadsModule } from './uploads/uploads.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { MembershipsModule } from './memberships/memberships.module';
import { FarmingSeasonsModule } from './farming-seasons/farming-seasons.module';
import { FarmLeasesModule } from './farm-leases/farm-leases.module';
import { FarmAlertsModule } from './farm-alerts/farm-alerts.module';
import { SmsModule } from './messaging/sms.module';
import { MessagingModule } from './messaging/messaging.module';
import { RewardsModule } from './rewards/rewards.module';
import { FarmReportsModule } from './farm-reports/farm-reports.module';
import { FarmRegistryModule } from './farm-registry/farm-registry.module';
import { LoggerMiddleware } from './middleware/logger.middleware';

@Module({
  imports: [
    // Load .env configuration globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Cron scheduling (e.g. daily farm-alert generation)
    ScheduleModule.forRoot(),

    // Database (Prisma ORM)
    PrismaModule,

    // Cross-cutting: row-level ownership, notifications, uploads
    CommonModule,
    NotificationsModule,
    UploadsModule,

    // Serve uploaded files (photos, documents) at /uploads
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), process.env.UPLOAD_DIR?.replace(/^\.\//, '') || 'uploads'),
      serveRoot: '/uploads',
    }),

    // Core Modules — Phase 1
    AuthModule,
    UsersModule,
    FarmersModule,

    // Core Entity Management & Farm Verification — Phase 2
    MamcosModule,
    FarmsModule,
    PlotsModule,
    FarmVerificationsModule,

    // Production & Traceability (Agronomy & Fairtrade) — Phase 3
    CropCyclesModule,
    FinanceModule,
    InventoryModule,

    // Geographic Hierarchy & Locations
    LocationsModule,

    // M-LAX Marketplace (Land & Tractor Leasing) — Phase 4
    MarketplaceModule,

    // Seasons, Ownership/Leases & Membership (owner comments) — Phase 5
    PaymentsModule,
    SmsModule,
    MembershipsModule,
    FarmingSeasonsModule,
    FarmLeasesModule,
    FarmAlertsModule,
    MessagingModule,
    RewardsModule,
    FarmReportsModule,
    FarmRegistryModule,
  ],
  providers: [
    // Global audit trail for all mutating requests
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
