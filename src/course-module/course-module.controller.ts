import {
  Body,
  Controller,
  Delete,
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

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UserRole } from '../generated/prisma/client';
import { CourseModuleService } from './course-module.service';
import { CreateCourseModuleDto } from './dto/create-module.dto';
import { ReorderModulesDto } from './dto/reorder-modules.dto';
import { UpdateCourseModuleDto } from './dto/update-module.dto';

const LOCKED_RESPONSE = {
  status: 403,
  description: 'Not the owner, or the program is in review or live.',
};

@ApiTags('Modules')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class CourseModuleController {
  constructor(private readonly courseModules: CourseModuleService) {}

  @Post('course/:courseId/modules')
  @ApiOperation({ summary: 'Add a module to the end of a program' })
  @ApiParam({ name: 'courseId', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Module created.' })
  @ApiResponse(LOCKED_RESPONSE)
  create(
    @Req() req: AuthenticatedRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateCourseModuleDto,
  ) {
    return this.courseModules.create(req.user, courseId, dto);
  }

  @Put('course/:courseId/modules/order')
  @ApiOperation({ summary: "Reorder a program's modules" })
  @ApiParam({ name: 'courseId', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Modules in their new order.' })
  @ApiResponse(LOCKED_RESPONSE)
  reorder(
    @Req() req: AuthenticatedRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: ReorderModulesDto,
  ) {
    return this.courseModules.reorder(req.user, courseId, dto);
  }

  @Patch('modules/:id')
  @ApiOperation({ summary: "Edit a module's title or description" })
  @ApiParam({ name: 'id', description: 'Module ID (UUID)' })
  @ApiResponse(LOCKED_RESPONSE)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseModuleDto,
  ) {
    return this.courseModules.update(req.user, id, dto);
  }

  @Delete('modules/:id')
  @ApiOperation({ summary: 'Delete a module with its lessons' })
  @ApiParam({ name: 'id', description: 'Module ID (UUID)' })
  @ApiResponse(LOCKED_RESPONSE)
  @ApiResponse({
    status: 409,
    description: 'Learners have bought or unlocked this module.',
  })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.courseModules.remove(req.user, id);
  }
}
