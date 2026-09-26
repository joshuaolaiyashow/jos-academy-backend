import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DiscussionService } from './discussion.service';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@ApiTags('Lesson Discussions')
@Controller('lessons/:lessonId/discussions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class DiscussionController {
  constructor(private readonly discussionService: DiscussionService) {}

  @Get()
  @ApiOperation({
    summary: 'List question threads (with replies) for a lesson',
  })
  @ApiParam({ name: 'lessonId', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Newest 50 threads.' })
  @ApiResponse({ status: 403, description: 'No access to this lesson.' })
  async listThreads(
    @Req() req: AuthenticatedRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.discussionService.listThreads(req.user, lessonId);
  }

  @Post()
  @ApiOperation({ summary: 'Ask a question, or reply when parentId is given' })
  @ApiParam({ name: 'lessonId', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Post created.' })
  @ApiResponse({ status: 400, description: 'Empty body or foreign parent.' })
  @ApiResponse({ status: 403, description: 'No access to this lesson.' })
  async post(
    @Req() req: AuthenticatedRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: CreateDiscussionDto,
  ) {
    return this.discussionService.post(req.user, lessonId, dto);
  }
}
