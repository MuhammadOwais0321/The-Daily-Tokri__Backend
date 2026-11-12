import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import * as path from 'path';
import 'multer';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint?: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') || '';
    this.endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (accessKeyId && secretAccessKey && this.bucket) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      });
      this.logger.log(`S3 client initialized for bucket: ${this.bucket}`);
    } else {
      this.logger.warn(
        'AWS S3 credentials or bucket not fully configured. File upload will use fallback URLs.',
      );
    }
  }

  /** Uploads image buffer to S3 with safe unique key */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'categories',
  ): Promise<string> {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const key = `${folder}/${randomUUID()}${ext}`;

    if (!this.s3Client) {
      this.logger.warn(
        `Mock upload for file: ${key} (AWS credentials not set)`,
      );
      return `https://${this.bucket || 'bucket'}.s3.${this.region}.amazonaws.com/${key}`;
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);

      const publicUrl = this.endpoint
        ? `${this.endpoint}/${this.bucket}/${key}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      this.logger.log(`File uploaded successfully to S3: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      this.logger.error(
        `Failed to upload file to S3: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'Failed to upload image to storage service',
      );
    }
  }

  /** Deletes object from S3 (best-effort) */
  async deleteFile(fileUrlOrKey: string): Promise<void> {
    if (!fileUrlOrKey || !this.s3Client) {
      return;
    }

    try {
      let key = fileUrlOrKey;
      if (
        fileUrlOrKey.startsWith('http://') ||
        fileUrlOrKey.startsWith('https://')
      ) {
        const url = new URL(fileUrlOrKey);
        // Strip leading slash and bucket name
        key = url.pathname.replace(/^\/+/, '');
        if (key.startsWith(`${this.bucket}/`)) {
          key = key.replace(`${this.bucket}/`, '');
        }
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Deleted S3 file: ${key}`);
    } catch (error) {
      this.logger.warn(
        `Failed to delete S3 file ${fileUrlOrKey}: ${(error as Error).message}`,
      );
    }
  }
}
