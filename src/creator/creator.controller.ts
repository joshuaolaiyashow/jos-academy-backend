import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreatorService } from './creator.service';
import { CreateCreatorDto } from './dto/create-creator.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Creators')
@Controller('creators')
export class CreatorController {
  constructor(private readonly creatorService: CreatorService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Onboard a new Creator / Instructor (Admin only)' })
  @ApiResponse({ status: 201, description: 'Creator onboarded successfully. Credentials emailed.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation error.' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Missing or invalid token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only Admin role can onboard creators.' })
  @ApiResponse({ status: 409, description: 'Conflict - Email already registered.' })
  async createCreator(@Body() createCreatorDto: CreateCreatorDto) {
    return this.creatorService.createCreator(createCreatorDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all creators / instructors' })
  @ApiResponse({ status: 200, description: 'List of all creators.' })
  async getCreators() {
    return this.creatorService.getCreators();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get creator details by ID' })
  @ApiParam({ name: 'id', description: 'Creator User ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Creator profile details.' })
  @ApiResponse({ status: 404, description: 'Not Found - Creator does not exist.' })
  async getCreatorById(@Param('id') id: string) {
    return this.creatorService.getCreatorById(id);
  }
}
