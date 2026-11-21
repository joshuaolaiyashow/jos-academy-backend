import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AudienceQueryDto,
  AudienceUnsubscribeDto,
  StudentAudienceQueryDto,
} from './dto/audience.dto';
import { AudienceExportGuard } from './workspace-auth.guard';
import {
  AUDIENCE_KEYS,
  type AudiencePage,
  WorkspaceAudiencesService,
} from './workspace-audiences';
import { WORKSPACE_AUDIENCES_PATH } from './workspace.constants';
import type { WorkspaceRecord } from './workspace-page';

type UnsubscribeResult = WorkspaceRecord<{
  email: string;
  unsubscribed: boolean;
}>;

/** Mailing lists the JOS Workspace pulls at broadcast send time; the workspace sends the mail, never this API. */
@ApiTags('JOS Workspace')
@ApiBearerAuth('JWT-auth')
@Controller(WORKSPACE_AUDIENCES_PATH)
@UseGuards(AudienceExportGuard)
export class WorkspaceAudiencesController {
  constructor(private readonly audiences: WorkspaceAudiencesService) {}

  @Get(AUDIENCE_KEYS.STUDENTS)
  @ApiOperation({ summary: 'Enrolled learners, optionally one program' })
  listStudents(@Query() query: StudentAudienceQueryDto): Promise<AudiencePage> {
    return this.audiences.list(AUDIENCE_KEYS.STUDENTS, query);
  }

  @Get(AUDIENCE_KEYS.INSTRUCTORS)
  @ApiOperation({ summary: 'Users with the instructor role' })
  listInstructors(@Query() query: AudienceQueryDto): Promise<AudiencePage> {
    return this.audiences.list(AUDIENCE_KEYS.INSTRUCTORS, query);
  }

  // Opting out is per user, so both audiences share one unsubscribe.
  @Post([
    `${AUDIENCE_KEYS.STUDENTS}/unsubscribe`,
    `${AUDIENCE_KEYS.INSTRUCTORS}/unsubscribe`,
  ])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Opt a user out of marketing broadcasts' })
  async unsubscribe(
    @Body() { email }: AudienceUnsubscribeDto,
  ): Promise<UnsubscribeResult> {
    return { data: await this.audiences.unsubscribe(email) };
  }
}
