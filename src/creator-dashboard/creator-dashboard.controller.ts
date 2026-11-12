import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreatorDashboardService } from './creator-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AssignmentAuthoringService } from '../assignment/assignment-authoring.service';
import { CourseProjectService } from '../course-project/course-project.service';
import { CreatorEarningsService } from './creator-earnings.service';
import { ListNotificationsQueryDto } from '../notification/dto/list-notifications-query.dto';

@ApiTags('Creator Dashboard')
@Controller('creator-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class CreatorDashboardController {
  constructor(
    private readonly creatorDashboardService: CreatorDashboardService,
    private readonly assignmentAuthoring: AssignmentAuthoringService,
    private readonly courseProjects: CourseProjectService,
    private readonly creatorEarnings: CreatorEarningsService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: "Get the logged-in creator's dashboard overview" })
  @ApiResponse({
    status: 200,
    description: 'Summary of programs, live sessions, and attendance.',
  })
  async getOverview(@Req() req: any) {
    return this.creatorDashboardService.getOverview(req.user.id);
  }

  @Get('programs')
  @ApiOperation({ summary: "Get the logged-in creator's programs (courses)" })
  @ApiResponse({
    status: 200,
    description: 'List of courses derived from the creator’s live sessions.',
  })
  async getPrograms(@Req() req: any) {
    return this.creatorDashboardService.getPrograms(req.user.id);
  }

  @Get('content')
  @ApiOperation({
    summary: "Get lessons for one of the logged-in creator's modules",
  })
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
  @ApiResponse({
    status: 404,
    description:
      'Not Found - Module does not exist or is not owned by the creator.',
  })
  async getContent(@Req() req: any, @Query('moduleId') moduleId?: string) {
    return this.creatorDashboardService.getContent(req.user.id, moduleId);
  }

  @Get('live-sessions')
  @ApiOperation({ summary: "Get the logged-in creator's live sessions" })
  @ApiResponse({
    status: 200,
    description: 'List of live sessions created by the logged-in creator.',
  })
  async getLiveSessions(@Req() req: any) {
    return this.creatorDashboardService.getLiveSessions(req.user.id);
  }

  @Get('notifications')
  @ApiOperation({ summary: "Get the logged-in creator's notifications" })
  @ApiResponse({
    status: 200,
    description: 'List of notifications for the logged-in creator.',
  })
  async getNotifications(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.creatorDashboardService.getNotifications(req.user.id, query);
  }

  @Get('assignments')
  @ApiOperation({
    summary: "The creator's assignments with real submission counts",
  })
  async getAssignments(@Req() req: AuthenticatedRequest) {
    return this.assignmentAuthoring.listForCreator(req.user);
  }

  @Get('projects')
  @ApiOperation({
    summary: "The creator's projects with per-milestone progress",
  })
  async getProjects(@Req() req: AuthenticatedRequest) {
    return this.courseProjects.listForCreator(req.user);
  }

  @Get('earnings')
  @ApiOperation({
    summary:
      "Gross revenue (USD) from credit spend on the creator's programs, net of refunds",
  })
  async getEarnings(@Req() req: AuthenticatedRequest) {
    return this.creatorEarnings.getEarnings(req.user.id);
  }
}
