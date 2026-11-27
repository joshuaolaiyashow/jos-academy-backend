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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListProgramsQueryDto } from '../admin/dto/list-programs-query.dto';
import { AdminService } from '../admin/admin.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UpdateDiscountCampaignDto } from '../discount/dto/create-discount-campaign.dto';
import { DiscountService } from '../discount/discount.service';
import { UserRole } from '../generated/prisma/client';
import { OnboardingService } from '../onboarding/onboarding.service';
import { PaginatedSearchQueryDto } from '../utils/pagination';
import {
  WorkspaceAccountsQueryDto,
  WorkspaceAuditLogQueryDto,
  WorkspaceCampaignsQueryDto,
  WorkspaceCreateAssessmentQuestionDto,
  WorkspaceCreateCampaignDto,
  WorkspaceProgramReviewDto,
  WorkspaceUpdateAssessmentQuestionDto,
} from './dto/workspace.dto';
import { toAssessmentOptions, toOptionLabels } from './assessment-options';
import { WorkspaceAuthGuard } from './workspace-auth.guard';
import { WorkspaceRecordsService } from './workspace-records.service';
import { WORKSPACE_ADMIN_PATH } from './workspace.constants';
import {
  findRecord,
  pageInMemory,
  toWorkspacePage,
  type WorkspacePage,
  type WorkspaceRecord,
} from './workspace-page';

type AdminStudent = Awaited<ReturnType<AdminService['getStudent']>>;

// Only the manifest's fields: the admin student object nests them and carries payments and progress too (those are tabs).
const toWorkspaceStudent = (student: AdminStudent) => ({
  id: student.id,
  name: student.name,
  email: student.email,
  phone: student.personalInfo.phone,
  country: student.personalInfo.country,
  bio: student.personalInfo.bio,
  credits: student.creditBalance,
  enrolledProgramsCount: student.enrolledProgramsCount,
  completedProgramsCount: student.completedProgramsCount,
  isSuspended: student.status === 'suspended',
  createdAt: student.personalInfo.dateJoined,
});

const toWorkspaceQuestion = <T extends { options: unknown }>(question: T) => ({
  ...question,
  options: toOptionLabels(question.options),
});

/**
 * The admin routes in the JOS Workspace contract shape ({ data, meta }), so the
 * existing Academy admin keeps its own endpoints and answers unchanged.
 */
@ApiTags('JOS Workspace')
@ApiBearerAuth('JWT-auth')
@Controller(WORKSPACE_ADMIN_PATH)
@UseGuards(WorkspaceAuthGuard)
export class WorkspaceController {
  constructor(
    private readonly admin: AdminService,
    private readonly discounts: DiscountService,
    private readonly onboarding: OnboardingService,
    private readonly audit: AuditService,
    private readonly records: WorkspaceRecordsService,
  ) {}

  @Get('programs')
  @ApiOperation({ summary: 'Programs in every status (workspace)' })
  async listPrograms(
    @Query() query: ListProgramsQueryDto,
  ): Promise<WorkspacePage<unknown>> {
    const { courses, ...meta } = await this.admin.getPrograms(query);
    return toWorkspacePage(courses, meta);
  }

  // Declared before programs/:id so "counts" isn't read as a program id.
  @Get('programs/counts')
  @ApiOperation({ summary: 'Programs per status, for the status tabs' })
  async programCounts(): Promise<WorkspaceRecord<Record<string, number>>> {
    return { data: await this.records.programStatusCounts() };
  }

  @Get('programs/:id')
  async readProgram(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return { data: await this.admin.getProgram(id) };
  }

  @Patch('programs/:id')
  @ApiOperation({
    summary: 'Approve or reject a program in review (workspace)',
  })
  async reviewProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkspaceProgramReviewDto,
  ): Promise<WorkspaceRecord<unknown>> {
    return {
      data: await this.admin.reviewCourse(id, dto.status, dto.rejectionReason),
    };
  }

  @Patch('programs/:id/start-review')
  async startProgramReview(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return { data: await this.admin.startReview(id) };
  }

  @Get('students')
  @ApiOperation({
    summary: 'Students (workspace); search matches name or email',
  })
  async listStudents(
    @Query() query: WorkspaceAccountsQueryDto,
  ): Promise<WorkspacePage<unknown>> {
    const { students, ...meta } = await this.admin.getStudents(
      query.page,
      query.limit,
      query.search,
      query.isSuspended,
    );
    return toWorkspacePage(students.map(toWorkspaceStudent), meta);
  }

  @Get('students/:id')
  async readStudent(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return { data: toWorkspaceStudent(await this.admin.getStudent(id)) };
  }

  @Patch('students/:id/suspend')
  async suspendStudent(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return {
      data: await this.admin.updateUserStatus(id, UserRole.USER, 'suspended'),
    };
  }

  @Patch('students/:id/reactivate')
  async reactivateStudent(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return {
      data: await this.admin.updateUserStatus(id, UserRole.USER, 'active'),
    };
  }

  @Get('campaigns')
  async listCampaigns(
    @Query() query: WorkspaceCampaignsQueryDto,
  ): Promise<WorkspacePage<unknown>> {
    const { campaigns } = await this.discounts.listCampaigns();
    return pageInMemory(campaigns, query, ['name', 'code'], {
      isActive: query.isActive,
    });
  }

  @Get('campaigns/:id')
  async readCampaign(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    const { campaigns } = await this.discounts.listCampaigns();
    return { data: findRecord(campaigns, id, 'Campaign') };
  }

  @Post('campaigns')
  async createCampaign(
    @Req() req: AuthenticatedRequest,
    @Body() { isActive, ...dto }: WorkspaceCreateCampaignDto,
  ): Promise<WorkspaceRecord<unknown>> {
    const created = await this.discounts.createCampaign(req.user.id, dto);
    // The legacy create always starts a campaign active.
    const data =
      isActive === false
        ? await this.discounts.updateCampaign(created.id, { isActive })
        : created;
    return { data };
  }

  @Patch('campaigns/:id')
  async updateCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiscountCampaignDto,
  ): Promise<WorkspaceRecord<unknown>> {
    return { data: await this.discounts.updateCampaign(id, dto) };
  }

  @Get('assessment')
  async listQuestions(
    @Query() query: PaginatedSearchQueryDto,
  ): Promise<WorkspacePage<unknown>> {
    const questions = (await this.onboarding.listAllQuestions()).map(
      toWorkspaceQuestion,
    );
    return pageInMemory(questions, query, ['subject', 'prompt']);
  }

  @Get('assessment/:id')
  async readQuestion(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    const questions = (await this.onboarding.listAllQuestions()).map(
      toWorkspaceQuestion,
    );
    return { data: findRecord(questions, id, 'Question') };
  }

  @Post('assessment')
  async createQuestion(
    @Body() { options, ...dto }: WorkspaceCreateAssessmentQuestionDto,
  ): Promise<WorkspaceRecord<unknown>> {
    const created = await this.onboarding.createQuestion({
      ...dto,
      options: toAssessmentOptions(options),
    });
    return { data: toWorkspaceQuestion(created) };
  }

  @Patch('assessment/:id')
  async updateQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { options, ...dto }: WorkspaceUpdateAssessmentQuestionDto,
  ): Promise<WorkspaceRecord<unknown>> {
    const updated = await this.onboarding.updateQuestion(id, {
      ...dto,
      options: options ? toAssessmentOptions(options) : undefined,
    });
    return { data: toWorkspaceQuestion(updated) };
  }

  @Delete('assessment/:id')
  async deleteQuestion(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.onboarding.deleteQuestion(id);
  }

  @Get('audit-log')
  @ApiOperation({
    summary: 'Audit log (workspace); search matches action or target',
  })
  async listAuditLog(
    @Query() query: WorkspaceAuditLogQueryDto,
  ): Promise<WorkspacePage<unknown>> {
    const { entries, ...meta } = await this.audit.list(query);
    return toWorkspacePage(entries, meta);
  }
}
