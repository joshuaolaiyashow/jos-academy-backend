import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UserRole } from '../generated/prisma/client';
import { CourseProjectService } from './course-project.service';
import { CreateCourseProjectDto } from './dto/create-course-project.dto';
import { SubmitMilestoneDto } from './dto/submit-milestone.dto';
import { UpdateCourseProjectDto } from './dto/update-course-project.dto';
import { RequestSubmissionUploadDto } from './dto/request-submission-upload.dto';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class CourseProjectController {
  constructor(private readonly projects: CourseProjectService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a capstone project with ordered milestones (owner only)',
  })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCourseProjectDto,
  ) {
    return this.projects.create(req.user, dto);
  }

  @Get('course/:courseId')
  @ApiOperation({
    summary:
      "A course's open projects with the caller's own milestone submissions",
  })
  @ApiParam({ name: 'courseId', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 403, description: 'Not enrolled.' })
  async listForCourse(
    @Req() req: AuthenticatedRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.projects.listForLearner(req.user, courseId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit or archive/complete a project (owner only)' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseProjectDto,
  ) {
    return this.projects.update(req.user, id, dto);
  }

  @Get(':id/submissions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'All milestone submissions for a project (owner only)',
  })
  async listSubmissions(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.listSubmissions(req.user, id);
  }

  @Post(':id/upload-url')
  @ApiOperation({
    summary:
      'Get a presigned URL to upload milestone work; pass the returned fileUrl when submitting',
  })
  @ApiResponse({
    status: 400,
    description: "File type not accepted for this project's submission type.",
  })
  async requestSubmissionUpload(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestSubmissionUploadDto,
  ) {
    return this.projects.requestSubmissionUpload(req.user, id, dto);
  }

  @Post(':id/milestones/:index')
  @ApiOperation({
    summary:
      'Submit milestone work as a link or uploaded file (in order; resubmission allowed)',
  })
  @ApiParam({ name: 'index', description: 'Zero-based milestone index' })
  @ApiResponse({
    status: 409,
    description: 'Previous milestone missing, or project closed.',
  })
  async submitMilestone(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: SubmitMilestoneDto,
  ) {
    return this.projects.submitMilestone(req.user, id, index, dto);
  }
}
