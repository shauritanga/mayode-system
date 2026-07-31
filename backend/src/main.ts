import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

  // Enable CORS for configured clients. Local development remains permissive.
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? configuredOrigins
        : configuredOrigins.length
          ? configuredOrigins
          : true,
    credentials: true,
  });

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
