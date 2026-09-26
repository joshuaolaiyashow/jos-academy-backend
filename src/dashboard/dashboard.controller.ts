import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Get the logged-in learner's dashboard summary",
    description:
      'Composes the active enrollments (with module and lesson progress), credit wallet balance, upcoming live sessions for enrolled courses, and the 5 most recent notifications for the authenticated learner.',
  })
  @ApiResponse({
    status: 200,
    description: 'Learner dashboard summary.',
    schema: {
      example: {
        enrollments: [
          {
            id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            courseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            courseName: 'Full-Stack Web Development Bootcamp',
            heroImage: 'fullstack-hero.png',
            category: 'Software Engineering',
            type: 'FULL_COURSE',
            status: 'ACTIVE',
            progressPercent: 35,
            totalCourseModules: 8,
            unlockedModulesCount: 8,
            completedLessonsCount: 12,
            totalLessonsCount: 34,
            createdAt: '2025-09-01T10:00:00.000Z',
          },
        ],
        creditBalance: {
          credits: 100,
          nairaEquivalent: 1000,
          conversionRate: '1 Credit = ₦10 (10 Credits = ₦100)',
        },
        upcomingLiveSessions: [
          {
            id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
            title: 'Introduction to Python for AI',
            type: 'Lecture',
            platform: 'Zoom',
            scheduledAt: '2025-10-28T09:00:00.000Z',
            durationMins: 60,
            status: 'SCHEDULED',
            courseName: 'Full-Stack Web Development Bootcamp',
            creatorName: 'Jane Instructor',
          },
        ],
        recentNotifications: [
          {
            id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
            userId: 'f6a7b8c9-d0e1-2345-fabc-456789012345',
            title: 'Module unlocked',
            body: 'You now have access to "Frontend Basics".',
            type: 'MODULE_UNLOCKED',
            isRead: false,
            createdAt: '2025-09-20T08:00:00.000Z',
          },
        ],
        unreadNotificationsCount: 3,
      },
    },
  })
  async getDashboard(@Req() req: any) {
    return this.dashboardService.getDashboard(req.user.id);
  }
}
