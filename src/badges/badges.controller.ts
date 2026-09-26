import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BadgesService } from './badges.service';
import { AwardBadgeDto, CreateBadgeDto, UpdateBadgeDto } from './dto/badge.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Badges')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get()
  @ApiOperation({ summary: 'All active badges learners can earn' })
  listActiveBadges() {
    return this.badgesService.listActiveBadges();
  }

  @Get('me')
  @ApiOperation({ summary: "The logged-in learner's earned badges" })
  getMine(@Req() req: any) {
    return this.badgesService.getMyBadges(req.user.id);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: all badges, including inactive ones' })
  listAllBadges() {
    return this.badgesService.listAllBadges();
  }

  @Post('admin')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: create a badge' })
  createBadge(@Body() dto: CreateBadgeDto) {
    return this.badgesService.createBadge(dto);
  }

  @Patch('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: edit, reorder or deactivate a badge' })
  updateBadge(@Param('id') id: string, @Body() dto: UpdateBadgeDto) {
    return this.badgesService.updateBadge(id, dto);
  }

  @Delete('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: delete a badge' })
  deleteBadge(@Param('id') id: string) {
    return this.badgesService.deleteBadge(id);
  }

  @Post('admin/:id/award')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: manually award a badge to a user' })
  awardBadge(@Param('id') id: string, @Body() dto: AwardBadgeDto) {
    return this.badgesService.awardBadge(id, dto.userId);
  }
}
