import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { I18nExceptionFilter } from './common/i18n/i18n-exception.filter';
import { I18nResponseInterceptor } from './common/i18n/i18n-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The table-export route receives the rows of a list to draw as PDF/Word/Excel, so it may be larger than the default 100 KB.
  // Wrapped in an arrow function (not passed directly) so this middleware isn't named `jsonParser` —
  // Nest's own body-parser registration skips adding its global JSON parser if it finds a middleware
  // with that exact name already in the stack, which would silently empty req.body on every other route.
  const tableExportJsonParser = json({ limit: '4mb' });
  app.use('/api/v1/accounting/table-export', (req, res, next) =>
    tableExportJsonParser(req, res, next),
  );

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    next();
  });

  // Global prefix for all API routes
  app.setGlobalPrefix('api/v1');

  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Enable CORS for configured clients. Local development remains permissive
  // regardless of CORS_ORIGINS, since .env.example ships production hostnames
  // that would otherwise lock out every localhost frontend in dev.
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? configuredOrigins : true,
    credentials: true,
  });

  // Errors come back in the app's language (Accept-Language)
  app.useGlobalFilters(new I18nExceptionFilter());
  app.useGlobalInterceptors(new I18nResponseInterceptor());

  // Global validation pipe for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('MAYODE GROUP API')
    .setDescription(
      'MAYODE GROUP Integrated System API — MAYOData Platform & M-LAX Marketplace',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication & Authorization')
    .addTag('users', 'User Management')
    .addTag('farmers', 'Farmer Profiles & Registration')
    .addTag('farms', 'Farm Registration & GPS Mapping')
    .addTag('crop-cycles', 'Crop Cycle Management')
    .addTag('payments', 'Payments & Escrow')
    .addTag('marketplace', 'M-LAX Land & Tractor Marketplace')
    .addTag('locations', 'Geographic Hierarchy & Administrative Boundaries')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║       MAYODE GROUP Integrated System API             ║
  ║       Running on: http://localhost:${port}              ║
  ║       Swagger:    http://localhost:${port}/api/docs     ║
  ╚══════════════════════════════════════════════════════╝
  `);
}

bootstrap();
