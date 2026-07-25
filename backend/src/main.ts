import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix for all API routes
  app.setGlobalPrefix('api/v1');

  // Enable CORS for web and mobile clients across all local Wi-Fi IP addresses
  app.enableCors({
    origin: true,
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
