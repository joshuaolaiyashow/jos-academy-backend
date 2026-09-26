import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { CohortService } from './cohort.service';
import { CohortRosterService } from './cohort-roster.service';
import { CreateCohortDto } from './dto/create-cohort.dto';
import { UpdateCohortDto } from './dto/update-cohort.dto';
import { SetCohortModulesDto } from './dto/set-cohort-modules.dto';

@ApiTags('Cohorts')
@Controller('cohorts')
export class CohortController {
  constructor(
    private readonly cohorts: CohortService,
    private readonly rosters: CohortRosterService,
  ) {}

  @Get('course/:courseId')
  @ApiOperation({
    summary:
      'Approved cohorts on sale: open ones with seats left, plus ended ones as rewatches (public)',
  })
  @ApiParam({ name: 'courseId', description: 'Course ID (UUID)' })
  async listForSale(@Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.cohorts.listForSale(courseId);
  }

  @Get('course/:courseId/manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Every cohort of a program (owner only)' })
  async listForOwner(
    @Req() req: AuthenticatedRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.cohorts.listForOwner(req.user, courseId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a draft cohort (owner only)' })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCohortDto) {
    return this.cohorts.create(req.user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Edit dates, name, seats or demo day (owner only)' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCohortDto,
  ) {
    return this.cohorts.update(req.user, id, dto);
  }

  @Put(':id/modules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Replace the cohort's module start dates (owner only)",
  })
  async setModules(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCohortModulesDto,
  ) {
    return this.cohorts.setModules(req.user, id, dto);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Submit for admin review; must be at least 7 days before it starts (owner only)',
  })
  @ApiResponse({
    status: 400,
    description: 'Too close to the start, or the schedule is incomplete.',
  })
  async submit(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cohorts.submitForReview(req.user, id);
  }

  @Get(':id/roster')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Learners in the cohort with modules bought and sessions attended (owner only)',
  })
  async roster(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rosters.roster(req.user, id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cancel a cohort nobody has joined (owner only)' })
  @ApiResponse({ status: 409, description: 'Learners have already joined.' })
  async cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cohorts.cancel(req.user, id);
  }
}
