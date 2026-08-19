import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
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
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
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
  uploadFile(@UploadedFile() file: UploadedFileMeta) {
    if (!file) {
      throw new BadRequestException('No file provided under form field "file"');
    }
    return {
      url: this.storage.publicUrl(file.filename),
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }
}
