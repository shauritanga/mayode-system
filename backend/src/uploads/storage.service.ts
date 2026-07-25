import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

/**
 * StorageService — abstraction over where uploaded files live.
 *
 * Today: local disk (UPLOAD_DIR, served statically at /uploads).
 * Later: swap the internals for S3/Cloudinary without touching callers.
 */
@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {
    // Ensure the upload directory exists at boot.
    const dir = this.uploadDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  get uploadDir(): string {
    return this.config.get<string>('UPLOAD_DIR') || './uploads';
  }

  get maxFileSize(): number {
    return parseInt(this.config.get<string>('MAX_FILE_SIZE') || '10485760', 10); // 10MB
  }

  /** Multer disk-storage engine with a collision-proof random filename. */
  multerStorage() {
    return diskStorage({
      destination: this.uploadDir,
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${randomUUID()}`;
        cb(null, `${unique}${extname(file.originalname)}`);
      },
    });
  }

  /** Public URL path for a stored filename (served by express.static). */
  publicUrl(filename: string): string {
    return `/uploads/${filename}`;
  }
}
