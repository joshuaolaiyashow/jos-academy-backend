import 'multer';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor() {
    this.region =
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      'us-east-1';

    const accessKeyId =
      process.env.AWS_ACCESS_KEY_ID || process.env.ACCESS_KEY || '';
    const secretAccessKey =
      process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET_KEY || '';

    this.bucketName =
      process.env.AWS_S3_BUCKET_NAME ||
      process.env.BUCKET_NAME ||
      'jos-academy';

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn(
        '⚠️ AWS credentials are not fully configured in environment variables!',
      );
    }

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Upload a single file (image, video, document, etc.) to AWS S3
   * @param file Express.Multer.File object from request
   * @param folder Folder prefix inside bucket (e.g. 'images', 'videos', 'courses')
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    // Sanitize filename and create unique S3 key
    const sanitizedOriginalName = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    const key = `${cleanFolder}/${Date.now()}-${randomUUID()}-${sanitizedOriginalName}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

      this.logger.log(`✅ File uploaded successfully: ${key}`);

      return {
        url,
        key,
        bucket: this.bucketName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      };
    } catch (error: any) {
      this.logger.error(`❌ Failed to upload file to S3 (${key}):`, error.message);
      throw new BadRequestException(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Upload multiple files to AWS S3 concurrently
   * @param files Array of Express.Multer.File objects
   * @param folder Target folder prefix
   */
  async uploadMultipleFiles(
    files: Express.Multer.File[],
    folder: string = 'general',
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided for upload');
    }

    return Promise.all(files.map((file) => this.uploadFile(file, folder)));
  }

  /**
   * Delete a file from AWS S3 by its Key
   * @param key S3 Object Key
   */
  async deleteFile(key: string) {
    if (!key) {
      throw new BadRequestException('File key is required');
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      this.logger.log(`🗑️ File deleted from S3: ${key}`);
      return {
        message: 'File deleted successfully',
        key,
        bucket: this.bucketName,
      };
    } catch (error: any) {
      this.logger.error(`❌ Failed to delete file from S3 (${key}):`, error.message);
      throw new BadRequestException(`Failed to delete file from S3: ${error.message}`);
    }
  }

  /**
   * Generate a temporary presigned URL for private S3 objects (e.g. video streams / downloads)
   * @param key S3 Object Key
   * @param expiresInSeconds Expiry duration in seconds (default 1 hour)
   */
  async getPresignedUrl(key: string, expiresInSeconds: number = 3600): Promise<string> {
    if (!key) {
      throw new BadRequestException('File key is required');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error: any) {
      this.logger.error(`❌ Failed to generate presigned URL for ${key}:`, error.message);
      throw new BadRequestException(`Failed to generate presigned URL: ${error.message}`);
    }
  }
}
