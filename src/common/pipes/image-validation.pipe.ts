import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import 'multer';

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

export function isAllowedImageMagicBytes(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) {
    return false;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // GIF: 47 49 46 38 (GIF87a or GIF89a)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return true;
  }

  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
}

@Injectable()
export class ImageValidationPipe implements PipeTransform {
  transform(
    file: Express.Multer.File | Express.Multer.File[],
    metadata: ArgumentMetadata,
  ) {
    if (!file || (Array.isArray(file) && file.length === 0)) {
      throw new BadRequestException('Image file is required');
    }

    const files = Array.isArray(file) ? file : [file];

    for (const f of files) {
      if (!f) {
        throw new BadRequestException('Image file is required');
      }

      if (f.size > MAX_IMAGE_SIZE) {
        throw new BadRequestException(
          'Image file size exceeds the 5 MB maximum limit',
        );
      }

      const allowedMimes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
      ];
      if (!allowedMimes.includes(f.mimetype.toLowerCase())) {
        throw new BadRequestException(
          'Invalid image format. Allowed formats: JPEG, PNG, WEBP, GIF',
        );
      }

      if (!isAllowedImageMagicBytes(f.buffer)) {
        throw new BadRequestException(
          'File content does not match a valid image structure (magic bytes verification failed)',
        );
      }
    }

    return file;
  }
}
