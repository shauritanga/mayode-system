import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { UploadsController } from './uploads.controller';
import { StorageService } from './storage.service';
import { DocumentsService } from './documents.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dir = config.get<string>('UPLOAD_DIR') || './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return {
          storage: diskStorage({
            destination: dir,
            filename: (_req, file, cb) => {
              const unique = `${Date.now()}-${randomUUID()}`;
              cb(null, `${unique}${extname(file.originalname)}`);
            },
          }),
          limits: {
            fileSize: parseInt(
              config.get<string>('MAX_FILE_SIZE') || '10485760',
              10,
            ),
          },
        };
      },
    }),
  ],
  controllers: [UploadsController],
  providers: [StorageService, DocumentsService],
  exports: [StorageService, DocumentsService],
})
export class UploadsModule {}
