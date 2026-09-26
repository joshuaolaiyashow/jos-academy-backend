import 'multer';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { ASSIGNMENT_FILE_MAX_BYTES } from './assignment.constants';
import { AssignmentAuthoringService } from './assignment-authoring.service';
import { AssignmentSubmissionService } from './assignment-submission.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@ApiTags('Assignments')
@Controller('assignments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AssignmentController {
  constructor(
    private readonly authoring: AssignmentAuthoringService,
    private readonly submissions: AssignmentSubmissionService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Create an assignment on one of your modules (draft unless publish is true)',
  })
  @ApiResponse({ status: 403, description: 'Not your program.' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.authoring.create(req.user, dto);
  }

  @Get('course/:courseId')
  @ApiOperation({
    summary:
      "Published assignments in a course's modules the caller can open, with their own submission status",
  })
  @ApiParam({ name: 'courseId', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 403, description: 'Not enrolled.' })
  async listForCourse(
    @Req() req: AuthenticatedRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.submissions.listForLearner(req.user, courseId);
  }

  @Get(':id')
  @ApiOperation({
    summary: "An assignment's questions and the caller's own submission",
  })
  @ApiParam({ name: 'id', description: 'Assignment ID (UUID)' })
  async getOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.submissions.getForLearner(req.user, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Edit title, instructions or due date (owner only)',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.authoring.update(req.user, id, dto);
  }

  @Post(':id/publish')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Publish a draft so enrolled learners can see it (owner only)',
  })
  async publish(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.authoring.publish(req.user, id);
  }

  @Get(':id/submissions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'All submissions for an assignment, with signed file links (owner only)',
  })
  async listSubmissions(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.submissions.listSubmissions(req.user, id);
  }

  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ASSIGNMENT_FILE_MAX_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary:
      'Upload a file answer; returns the fileKey to include in the submission',
  })
  async uploadFile(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.submissions.uploadAnswerFile(req.user, id, file);
  }

  @Post(':id/submissions')
  @ApiOperation({
    summary:
      'Submit answers to an assignment (one final submission per learner)',
  })
  @ApiResponse({
    status: 409,
    description: 'Already submitted, or the program is read-only.',
  })
  async submit(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAssignmentDto,
  ) {
    return this.submissions.submit(req.user, id, dto);
  }
}
