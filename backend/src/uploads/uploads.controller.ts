import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import * as fs from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StorageService } from './storage.service';

/** Minimal multer file shape (avoids depending on Express.Multer namespace types). */
interface UploadedFileMeta {
  path: string;
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
}

/** True when the first bytes are a JPEG, PNG or HEIC/HEIF image (what a phone camera produces). */
function looksLikeCameraImage(path: string): boolean {
  const head = Buffer.alloc(12);
  const fd = fs.openSync(path, 'r');
  try {
    fs.readSync(fd, head, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const png = head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const heic =
    head.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(head.subarray(8, 12).toString('ascii'));
  return jpeg || png || heic;
}

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a single file (photo, document, receipt). Returns a URL to reference elsewhere.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadFile(
    @UploadedFile() file: UploadedFileMeta,
    @Headers('x-mayode-client') client?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided under form field "file"');
    }
    // The mobile app captures everything with the camera, so it may only send images.
    if (client === 'mobile-camera' && !looksLikeCameraImage(file.path)) {
      fs.unlink(file.path, () => undefined);
      throw new BadRequestException(
        'Only photos taken with the camera can be uploaded from the mobile app.',
      );
    }
    return {
      url: this.storage.publicUrl(file.filename),
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }
}
