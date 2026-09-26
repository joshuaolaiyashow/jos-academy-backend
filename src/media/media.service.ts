import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface UploadUrlResult {
  key: string;
  uploadUrl: string;
  fileUrl: string;
}

export interface LessonTranscodeMetadata {
  lessonId: string;
}

interface SubmitTranscodeJobParams {
  sourceUrl: string;
  outputType: 'hls' | 'audio';
  prefix: string;
  callbackUrl: string;
  metadata: LessonTranscodeMetadata;
}

/**
 * Thin client for media-processor-service (https://media-processor.josmedia.org),
 * the same standalone transcoding service jos-tvplus-backend already uses. It runs
 * in "self" storage mode for this deployment — the service owns its own S3 bucket,
 * so requests only send a folder `prefix`, never destination credentials.
 */
/** Folders inside the media service's bucket, per kind of upload. */
export const MEDIA_UPLOAD_PREFIXES = {
  LESSON_VIDEOS: 'academy/lessons/uploads',
  COURSE_IMAGES: 'academy/courses/images',
  REVIEW_FEEDBACK: 'academy/courses/review-feedback',
} as const;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  private get baseUrl(): string {
    return process.env.MEDIA_PROCESSOR_URL || '';
  }

  private get headers() {
    return { 'x-api-key': process.env.MEDIA_PROCESSOR_API_KEY || '' };
  }

  /**
   * Delegates presigning to POST /uploads. The raw file is PUT straight to S3 by
   * the client — it never passes through this backend.
   */
  async requestUploadUrl(
    params: {
      fileName: string;
      contentType: string;
    },
    prefix: string = MEDIA_UPLOAD_PREFIXES.LESSON_VIDEOS,
  ): Promise<UploadUrlResult> {
    const response = await axios.post<UploadUrlResult>(
      `${this.baseUrl}/uploads`,
      {
        fileName: params.fileName,
        contentType: params.contentType,
        prefix,
      },
      { headers: this.headers },
    );

    return response.data;
  }

  async submitTranscodeJob({
    sourceUrl,
    outputType,
    prefix,
    callbackUrl,
    metadata,
  }: SubmitTranscodeJobParams): Promise<string> {
    const response = await axios.post<{ jobId: string }>(
      `${this.baseUrl}/jobs`,
      {
        sourceUrl,
        outputType,
        destination: { prefix },
        callbackUrl,
        metadata,
      },
      { headers: this.headers },
    );

    this.logger.log(
      `🎬 Transcode job submitted for lesson ${metadata.lessonId}: ${response.data.jobId}`,
    );
    return response.data.jobId;
  }
}
