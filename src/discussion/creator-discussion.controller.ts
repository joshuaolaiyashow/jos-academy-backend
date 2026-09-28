import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DiscussionService } from './discussion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@ApiTags('Creator Dashboard')
@Controller('creator-dashboard/discussions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class CreatorDiscussionController {
  constructor(private readonly discussionService: DiscussionService) {}

  @Get()
  @ApiOperation({
    summary: "Learner questions across the logged-in creator's programs",
  })
  @ApiResponse({
    status: 200,
    description: 'Newest 50 threads, each with its lesson and replies.',
  })
  async listForCreator(@Req() req: AuthenticatedRequest) {
    return this.discussionService.listForCreator(req.user.id);
  }
}
