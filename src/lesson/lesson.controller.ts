import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LessonService } from './lesson.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@ApiTags('Lessons')
@Controller('lessons')
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new lesson under a module (Admin or Instructor only)',
  })
  @ApiResponse({ status: 201, description: 'Lesson created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation error.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Token missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only Admin or Instructor role can create lessons.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Module does not exist.',
  })
  async createLesson(
    @Body() createLessonDto: CreateLessonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonService.createLesson(createLessonDto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all lessons for a module' })
  @ApiQuery({
    name: 'moduleId',
    required: true,
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    description: 'Module ID to fetch lessons for',
  })
  @ApiResponse({ status: 200, description: 'List of lessons for the module.' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - moduleId is required.',
  })
  async getLessons(@Query('moduleId') moduleId?: string) {
    return this.lessonService.getLessonsByModule(moduleId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Update a lesson's own fields (course creator or Admin only)",
  })
  @ApiParam({ name: 'id', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Lesson updated successfully.' })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Not this lesson's course creator.",
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Lesson does not exist.',
  })
  async updateLesson(
    @Param('id') id: string,
    @Body() updateLessonDto: UpdateLessonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonService.updateLesson(id, updateLessonDto, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a lesson (course creator while editable, or Admin)',
  })
  @ApiParam({ name: 'id', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Lesson deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Not the owner, or the program is in review or live.',
  })
  @ApiResponse({ status: 404, description: 'Lesson does not exist.' })
  async deleteLesson(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonService.deleteLesson(id, req.user);
  }

  @Get('progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get completed lesson IDs for the logged-in student within a course',
  })
  @ApiQuery({
    name: 'courseId',
    required: true,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Course ID to fetch lesson completion progress for',
  })
  @ApiResponse({
    status: 200,
    description: 'Completed lesson IDs for the course.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - courseId is required.',
  })
  async getProgress(@Req() req: any, @Query('courseId') courseId?: string) {
    return this.lessonService.getCourseProgress(req.user.id, courseId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get a lesson by ID (content locked unless the student has module access)',
  })
  @ApiParam({ name: 'id', description: 'Lesson ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Lesson details (locked payload if the student lacks access).',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Token missing or invalid.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Lesson does not exist.',
  })
  async getLessonById(@Param('id') id: string, @Req() req: any) {
    return this.lessonService.getLessonById(id, req.user);
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Mark a lesson as complete for the logged-in student',
  })
  @ApiParam({ name: 'id', description: 'Lesson ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Lesson marked as complete.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Token missing or invalid.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Lesson does not exist.',
  })
  async completeLesson(@Param('id') id: string, @Req() req: any) {
    return this.lessonService.completeLesson(req.user.id, id);
  }
}
