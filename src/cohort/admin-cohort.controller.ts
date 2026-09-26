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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { CohortReviewService } from './cohort-review.service';
import { CohortRosterService } from './cohort-roster.service';
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto';
import { ListCohortsQueryDto } from './dto/list-cohorts-query.dto';
import { ReviewCohortDto } from './dto/review-cohort.dto';

@ApiTags('Admin cohorts')
@Controller('admin/cohorts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class AdminCohortController {
  constructor(
    private readonly reviews: CohortReviewService,
    private readonly rosters: CohortRosterService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Cohorts in a status, pending review by default (Admin only)',
  })
  async listQueue(@Query() query: ListCohortsQueryDto) {
    return this.reviews.listQueue(query.status);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'A cohort with its schedule and full program, for the review page (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Cohort ID (UUID)' })
  async getForReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.getForReview(id);
  }

  @Patch('enrollments/:enrollmentId/transfer')
  @ApiOperation({
    summary:
      'Move a learner to another approved cohort of the same program (Admin only)',
  })
  @ApiResponse({ status: 409, description: 'Target cohort is full.' })
  async transfer(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: TransferEnrollmentDto,
  ) {
    return this.rosters.transfer(enrollmentId, dto.cohortId);
  }

  @Patch(':id/start-review')
  @ApiOperation({
    summary:
      'Start reviewing a pending cohort; locks creator edits (Admin only)',
  })
  @ApiResponse({ status: 400, description: 'Cohort is not pending review.' })
  async startReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.startReview(id);
  }

  @Patch(':id/review')
  @ApiOperation({
    summary: 'Approve, or request changes with a reason (Admin only)',
  })
  @ApiResponse({ status: 400, description: 'Review has not been started.' })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCohortDto,
  ) {
    return this.reviews.review(id, dto);
  }
}
