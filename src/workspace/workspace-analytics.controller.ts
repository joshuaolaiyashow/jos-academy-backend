import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { type ChartWindow, windowProblem } from './chart-window';
import { ChartQueryDto } from './dto/chart-query.dto';
import { FunnelPeopleQueryDto } from './dto/funnel-people-query.dto';
import { WorkspaceAnalyticsService } from './workspace-analytics.service';
import { WorkspaceAuthGuard } from './workspace-auth.guard';
import { WORKSPACE_ADMIN_PATH } from './workspace.constants';
import type { WorkspacePage } from './workspace-page';

type Answer<T> = Promise<{ data: T }>;

const checked = <T extends ChartQueryDto>(query: T): T & ChartWindow => {
  const problem = windowProblem(query);
  if (problem) throw new BadRequestException(problem);
  return query;
};

/**
 * The project's Overview charts. Living under workspace/admin/analytics means the guard asks for
 * `analytics:view`, the one role the workspace grants for a whole Overview.
 */
@ApiTags('JOS Workspace')
@ApiBearerAuth('JWT-auth')
@Controller(`${WORKSPACE_ADMIN_PATH}/analytics`)
@UseGuards(WorkspaceAuthGuard)
export class WorkspaceAnalyticsController {
  constructor(private readonly analytics: WorkspaceAnalyticsService) {}

  @Get('total-students')
  async totalStudents(): Answer<unknown> {
    return { data: await this.analytics.totalStudents() };
  }

  @Get('new-students')
  async newStudents(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.newStudents(checked(query)) };
  }

  @Get('onboarding-completion')
  async onboardingCompletion(): Answer<unknown> {
    return { data: await this.analytics.onboardingCompletion() };
  }

  @Get('revenue')
  async revenue(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.revenue(checked(query)) };
  }

  @Get('enrolments')
  async enrolments(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.enrolments(checked(query)) };
  }

  @Get('lessons-completed')
  async lessonsCompleted(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.lessonsCompleted(checked(query)) };
  }

  @Get('certificates')
  async certificates(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.certificatesIssued(checked(query)) };
  }

  @Get('failed-payments')
  async failedPayments(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.failedPayments(checked(query)) };
  }

  @Get('average-rating')
  async averageRating(): Answer<unknown> {
    return { data: await this.analytics.averageRating() };
  }

  @Get('signups')
  async signups(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.signups(checked(query)) };
  }

  @Get('revenue-over-time')
  async revenueOverTime(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.revenueOverTime(checked(query)) };
  }

  @Get('enrolments-over-time')
  async enrolmentsOverTime(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.enrolmentsOverTime(checked(query)) };
  }

  @Get('top-programs')
  async topPrograms(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.topPrograms(checked(query)) };
  }

  @Get('revenue-by-program')
  async revenueByProgram(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.revenueByProgram(checked(query)) };
  }

  @Get('enrolments-by-status')
  async enrolmentsByStatus(): Answer<unknown> {
    return { data: await this.analytics.enrolmentsByStatus() };
  }

  @Get('signup-funnel')
  async signupFunnel(@Query() query: ChartQueryDto): Answer<unknown> {
    return { data: await this.analytics.signupFunnel(checked(query)) };
  }
}

/**
 * Who left at each step of the signup funnel. These lists carry emails, so they sit under workspace/admin/students
 * and the guard asks for `students:view`, not just `analytics:view`; the workspace audits every view.
 */
@ApiTags('JOS Workspace')
@ApiBearerAuth('JWT-auth')
@Controller(`${WORKSPACE_ADMIN_PATH}/students/signup-funnel`)
@UseGuards(WorkspaceAuthGuard)
export class WorkspaceFunnelPeopleController {
  constructor(private readonly analytics: WorkspaceAnalyticsService) {}

  @Get('people')
  signupDropoffs(
    @Query() query: FunnelPeopleQueryDto,
  ): Promise<WorkspacePage<unknown>> {
    return this.analytics.signupDropoffs(checked(query));
  }
}
