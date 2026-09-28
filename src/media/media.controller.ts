import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MEDIA_UPLOAD_PREFIXES, MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessService } from '../course-access/course-access.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { RequestCourseImageUploadDto } from './dto/request-course-image-upload.dto';
import { StartTranscodeDto } from './dto/start-transcode.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, LessonVideoStatus } from '../generated/prisma/client';
import {
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
} from './verify-webhook-signature';

interface TranscodeCallbackBody {
  jobId: string;
  status: 'ready' | 'failed';
  outputUrl?: string;
  error?: string;
  metadata?: { lessonId: string };
}

@ApiTags('Media')
@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly mediaService: MediaService,
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  @Post('upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get a presigned URL to upload a raw lesson video (Admin or Instructor)',
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned upload URL and the resulting file URL.',
  })
  async getUploadUrl(@Body() dto: RequestUploadUrlDto) {
    try {
      return await this.mediaService.requestUploadUrl(dto);
    } catch (error: any) {
      this.logger.error(`Failed to get upload URL: ${error.message}`);
      throw new InternalServerErrorException(
        'Could not get an upload URL from the media service',
      );
    }
  }

  @Post('review-feedback/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get a presigned URL for a review screenshot; pass the returned fileUrl in the review attachmentUrls',
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned upload URL and the public file URL.',
  })
  async getReviewFeedbackUploadUrl(@Body() dto: RequestCourseImageUploadDto) {
    try {
      return await this.mediaService.requestUploadUrl(
        dto,
        MEDIA_UPLOAD_PREFIXES.REVIEW_FEEDBACK,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to get review screenshot upload URL: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Could not get an upload URL from the media service',
      );
    }
  }

  @Post('course-images/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      "Get a presigned URL to upload a program's hero image; save the returned fileUrl as heroImageName",
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned upload URL and the public file URL.',
  })
  async getCourseImageUploadUrl(@Body() dto: RequestCourseImageUploadDto) {
    try {
      return await this.mediaService.requestUploadUrl(
        dto,
        MEDIA_UPLOAD_PREFIXES.COURSE_IMAGES,
      );
    } catch (error: any) {
      this.logger.error(`Failed to get image upload URL: ${error.message}`);
      throw new InternalServerErrorException(
        'Could not get an upload URL from the media service',
      );
    }
  }

  @Post('lessons/:lessonId/transcode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      "Submit a lesson's uploaded video for HLS transcoding (lesson's course creator or Admin)",
  })
  @ApiParam({ name: 'lessonId', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 202, description: 'Transcode job queued.' })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Not this lesson's course creator.",
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Lesson does not exist.',
  })
  @HttpCode(202)
  async startTranscode(
    @Param('lessonId') lessonId: string,
    @Body() dto: StartTranscodeDto,
    @Req() req: any,
  ) {
    await this.courseAccess.findEditableLesson(req.user, lessonId);

    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

    try {
      await this.mediaService.submitTranscodeJob({
        sourceUrl: dto.sourceUrl,
        outputType: 'hls',
        prefix: `academy/lessons/${lessonId}`,
        callbackUrl: `${apiBaseUrl}/media/transcode-callback`,
        metadata: { lessonId },
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to submit transcode job for lesson ${lessonId}: ${error.message}` +
          (error.response?.data
            ? ` — media processor said: ${JSON.stringify(error.response.data)}`
            : ''),
      );
      throw new InternalServerErrorException(
        'Could not submit the transcode job',
      );
    }

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        videoProcessingStatus: LessonVideoStatus.PENDING,
        videoProcessingError: null,
      },
    });

    return {
      message: 'Transcode job queued',
      videoProcessingStatus: LessonVideoStatus.PENDING,
    };
  }

  @Get('lessons/:lessonId/transcode-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      "Get a lesson's video transcode status (lesson's course creator or Admin)",
  })
  @ApiParam({ name: 'lessonId', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Transcode status.' })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Not this lesson's course creator.",
  })
  async getTranscodeStatus(
    @Param('lessonId') lessonId: string,
    @Req() req: any,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        videoProcessingStatus: true,
        videoProcessingError: true,
        videoUrl: true,
        module: { select: { course: { select: { creatorId: true } } } },
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID "${lessonId}" not found`);
    }
    // Deliberately not findEditableLesson: creators keep polling after the program goes live.
    if (
      !this.courseAccess.isOwnerOrAdmin(
        req.user,
        lesson.module.course.creatorId,
      )
    ) {
      throw new ForbiddenException(
        "You can only view your own lessons' videos.",
      );
    }

    const { module, ...status } = lesson;
    return status;
  }

  /**
   * Delivered by media-processor-service on transcode completion/failure. Public
   * (no JwtAuthGuard) — integrity comes from the HMAC signature, not a bearer
   * token. Reads `req.rawBody` (enabled via `rawBody: true` in main.ts) so the
   * signature is verified against the exact bytes the service signed.
   */
  @Post('transcode-callback')
  @HttpCode(200)
  @ApiOperation({
    summary: 'media-processor-service transcode completion webhook (internal)',
  })
  async handleTranscodeCallback(@Req() req: any) {
    const secret = process.env.MEDIA_PROCESSOR_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error(
        'MEDIA_PROCESSOR_WEBHOOK_SECRET is not set — rejecting transcode callback',
      );
      throw new InternalServerErrorException('Webhook secret not configured');
    }

    const rawBody: Buffer | undefined = req.rawBody;
    if (
      !rawBody ||
      !verifyWebhookSignature(
        rawBody,
        req.headers[WEBHOOK_SIGNATURE_HEADER],
        secret,
      )
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = JSON.parse(rawBody.toString('utf8')) as TranscodeCallbackBody;
    const lessonId = body.metadata?.lessonId;
    if (!lessonId) {
      throw new BadRequestException('metadata.lessonId is required');
    }

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        videoUrl: body.status === 'ready' ? body.outputUrl : undefined,
        videoProcessingStatus:
          body.status === 'ready'
            ? LessonVideoStatus.READY
            : LessonVideoStatus.FAILED,
        videoProcessingError: body.status === 'failed' ? body.error : null,
      },
    });

    this.logger.log(
      `🎬 Transcode callback for lesson ${lessonId}: ${body.status}`,
    );
    return { message: 'Transcode status updated' };
  }
}
