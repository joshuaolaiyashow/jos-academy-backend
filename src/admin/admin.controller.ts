import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { ReviewCourseDto } from './dto/review-course.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { ListProgramsQueryDto } from './dto/list-programs-query.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Platform-wide stats and health metrics (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Stats and platform health, derived from live data.',
  })
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('students')
  @ApiOperation({
    summary:
      'Paginated list of students with enrollment/payment data (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Paginated students.' })
  async getStudents(@Query() query: ListStudentsQueryDto) {
    return this.adminService.getStudents(query.page ?? 1, query.limit ?? 20);
  }

  @Patch('students/:id/status')
  @ApiOperation({
    summary: 'Suspend or reactivate a student account (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Student User ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Student status updated.' })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Student does not exist.',
  })
  async updateStudentStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, UserRole.USER, dto.status);
  }

  @Patch('creators/:id/status')
  @ApiOperation({
    summary: 'Suspend or reactivate a creator account (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Creator User ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Creator status updated.' })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Creator does not exist.',
  })
  async updateCreatorStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(
      id,
      UserRole.INSTRUCTOR,
      dto.status,
    );
  }

  @Get('programs')
  @ApiOperation({
    summary: 'Paginated courses in every status, for review (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Courses with status, creator, lesson count and rating.',
  })
  async getPrograms(@Query() query: ListProgramsQueryDto) {
    return this.adminService.getPrograms(query);
  }

  @Get('programs/:id')
  @ApiOperation({
    summary: 'One course with curriculum, students and stats (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 404, description: 'Course not found.' })
  async getProgram(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getProgram(id);
  }

  @Get('programs/:id/review')
  @ApiOperation({
    summary:
      'A program with its dates and full curriculum, for the review page (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Course ID (UUID)' })
  async getProgramForReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getProgramForReview(id);
  }

  @Patch('programs/:id/start-review')
  @ApiOperation({
    summary:
      'Start reviewing a pending course; locks creator edits (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Course is now in review.' })
  @ApiResponse({ status: 400, description: 'Course is not pending review.' })
  async startProgramReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.startReview(id);
  }

  @Patch('programs/:id/review')
  @ApiOperation({
    summary: 'Approve or reject a course that is in review (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Course ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Course status updated; creator notified.',
  })
  async reviewProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCourseDto,
  ) {
    return this.adminService.reviewCourse(
      id,
      dto.status,
      dto.reason,
      dto.attachmentUrls,
    );
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Revenue, growth, category, and funnel analytics (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Trailing 12-month analytics, derived from live data.',
  })
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }
}
