import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UserRole } from '../generated/prisma/client';
import { AssignmentSubmissionService } from './assignment-submission.service';
import { GradeSubmissionDto } from './dto/grade-submission.dto';

@ApiTags('Assignments')
@Controller('assignment-submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class AssignmentGradingController {
  constructor(private readonly submissions: AssignmentSubmissionService) {}

  @Patch(':id/grade')
  @ApiOperation({ summary: 'Grade a submission (owner of the program only)' })
  async grade(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.submissions.grade(req.user, id, dto);
  }
}
