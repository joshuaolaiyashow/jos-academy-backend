import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ExploreService } from './explore.service';
import { DurationType, TargetLevel } from '../generated/prisma/client';

@ApiTags('Explore')
@Controller('explore')
export class ExploreController {
  constructor(private readonly exploreService: ExploreService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse the public Explore course catalog with optional filters',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by Category ID',
  })
  @ApiQuery({
    name: 'targetLevel',
    required: false,
    enum: TargetLevel,
    description: 'Filter by target level',
  })
  @ApiQuery({
    name: 'durationType',
    required: false,
    enum: DurationType,
    description: 'Filter by duration type',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      'Case-insensitive search against course name and short description',
  })
  @ApiResponse({
    status: 200,
    description: 'List of matching courses with category and modules.',
  })
  async getCatalog(
    @Query('categoryId') categoryId?: string,
    @Query('targetLevel') targetLevel?: TargetLevel,
    @Query('durationType') durationType?: DurationType,
    @Query('search') search?: string,
  ) {
    return this.exploreService.getCatalog(
      categoryId,
      targetLevel,
      durationType,
      search,
    );
  }

  @Get('featured')
  @ApiOperation({
    summary: 'Get a curated subset of courses for the Explore featured rail',
  })
  @ApiResponse({
    status: 200,
    description: 'Curated list of featured courses.',
  })
  async getFeatured() {
    return this.exploreService.getFeatured();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Explore course detail, including upcoming live sessions',
  })
  @ApiParam({ name: 'id', description: 'Course ID (UUID)' })
  @ApiResponse({
    status: 200,
    description:
      'Course detail with modules, lessons, and upcoming live sessions.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Course does not exist.',
  })
  async getCourseDetail(@Param('id') id: string) {
    return this.exploreService.getCourseDetail(id);
  }
}
