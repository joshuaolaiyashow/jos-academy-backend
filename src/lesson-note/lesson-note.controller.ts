import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
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
import { LessonNoteService } from './lesson-note.service';
import { UpsertLessonNoteDto } from './dto/upsert-lesson-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@ApiTags('Lesson Notes')
@Controller('lessons/:lessonId/note')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class LessonNoteController {
  constructor(private readonly lessonNoteService: LessonNoteService) {}

  @Get()
  @ApiOperation({
    summary: "Get the logged-in user's private note for a lesson",
  })
  @ApiParam({ name: 'lessonId', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 200, description: 'The note (empty if none yet).' })
  @ApiResponse({ status: 403, description: 'No access to this lesson.' })
  async getNote(
    @Req() req: AuthenticatedRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.lessonNoteService.getNote(req.user, lessonId);
  }

  @Put()
  @ApiOperation({
    summary: "Save the logged-in user's private note for a lesson",
  })
  @ApiParam({ name: 'lessonId', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Note saved.' })
  @ApiResponse({ status: 403, description: 'No access to this lesson.' })
  async saveNote(
    @Req() req: AuthenticatedRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: UpsertLessonNoteDto,
  ) {
    return this.lessonNoteService.saveNote(req.user, lessonId, dto.content);
  }
}
