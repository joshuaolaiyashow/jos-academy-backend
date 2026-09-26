import {
  Body,
  Controller,
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
import { LiveSessionService } from './live-session.service';
import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { UpdateLiveSessionStatusDto } from './dto/update-live-session-status.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { UpdateLiveSessionDto } from './dto/update-live-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Live Sessions')
@Controller('live-sessions')
export class LiveSessionController {
  constructor(private readonly liveSessionService: LiveSessionService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Schedule a new live session (Admin/Instructor only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Live session created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Module does not belong to course.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Token missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only Admin/Instructor roles allowed.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Course does not exist.',
  })
  async createLiveSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateLiveSessionDto,
  ) {
    return this.liveSessionService.createLiveSession(req.user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all live sessions (optionally filtered by course)',
  })
  @ApiQuery({
    name: 'courseId',
    required: false,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Optional Course ID to filter sessions by course',
  })
  @ApiResponse({ status: 200, description: 'List of matching live sessions.' })
  async getLiveSessions(@Query('courseId') courseId?: string) {
    return this.liveSessionService.getLiveSessions(courseId);
  }

  @Get('course/:courseId/cohort')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      "Sessions for the caller's cohort, with recordings (every session for the owner)",
  })
  @ApiParam({ name: 'courseId', description: 'Course ID (UUID)' })
  async getCohortSessions(
    @Req() req: AuthenticatedRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.liveSessionService.getCohortSessions(courseId, req.user);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get all live sessions created by the logged-in user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of sessions created by the logged-in user.',
  })
  async getMySessions(@Req() req: AuthenticatedRequest) {
    return this.liveSessionService.getMySessions(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get a live session by ID, including full attendance list (creator or Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Live session ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Live session details.' })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Live session does not exist.',
  })
  async getLiveSessionById(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.liveSessionService.getLiveSessionById(id, req.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Update a live session's meeting link (creator or Admin only)",
  })
  @ApiParam({ name: 'id', description: 'Live session ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Live session updated.' })
  @ApiResponse({ status: 403, description: 'Not the session creator.' })
  async updateLiveSession(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLiveSessionDto,
  ) {
    return this.liveSessionService.updateLiveSession(id, req.user, dto);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Join a live session: records attendance and returns the meeting link',
  })
  @ApiParam({ name: 'id', description: 'Live session ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Joined; meeting link returned.' })
  @ApiResponse({ status: 403, description: 'Not enrolled in this course.' })
  @ApiResponse({
    status: 409,
    description: 'Session is not live yet, or has no meeting link.',
  })
  async joinSession(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.liveSessionService.joinSession(id, req.user);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a live session status (creator or Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Live session ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Live session status updated successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Not the session creator or an admin.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Live session does not exist.',
  })
  async updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLiveSessionStatusDto,
  ) {
    return this.liveSessionService.updateStatus(
      id,
      req.user.id,
      req.user.role,
      dto,
    );
  }

  @Post(':id/register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Register the logged-in learner for a live session',
  })
  @ApiParam({ name: 'id', description: 'Live session ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Registered for live session successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Live session does not exist.',
  })
  async registerForSession(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.liveSessionService.registerForSession(id, req.user);
  }

  @Post(':id/attendance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      "Mark a learner's attendance for a session (creator or Admin only)",
  })
  @ApiParam({ name: 'id', description: 'Live session ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Attendance marked successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Not the session creator or an admin.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Live session does not exist.',
  })
  async markAttendance(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.liveSessionService.markAttendance(
      id,
      req.user.id,
      req.user.role,
      dto,
    );
  }

  @Get(':id/attendance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get the full attendance list for a session (creator or Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Live session ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'List of attendance records for the session.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Not the session creator or an admin.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Live session does not exist.',
  })
  async getSessionAttendance(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.liveSessionService.getSessionAttendance(
      id,
      req.user.id,
      req.user.role,
    );
  }
}
