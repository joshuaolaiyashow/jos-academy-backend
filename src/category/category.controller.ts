import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new category (Admin only)' })
  @ApiResponse({ status: 201, description: 'Category created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation error.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Token missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only Admin role can create categories.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Category name already exists.',
  })
  async createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.createCategory(createCategoryDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Rename or re-describe a category (Admin only)' })
  @ApiParam({ name: 'id', description: 'Category ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Category updated.' })
  @ApiResponse({ status: 404, description: 'Category does not exist.' })
  @ApiResponse({ status: 409, description: 'Category name already exists.' })
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.updateCategory(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete an unused category (Admin only)' })
  @ApiParam({ name: 'id', description: 'Category ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Category deleted.' })
  @ApiResponse({ status: 404, description: 'Category does not exist.' })
  @ApiResponse({ status: 409, description: 'Category still has programs.' })
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.deleteCategory(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all categories with course counts' })
  @ApiResponse({ status: 200, description: 'List of all categories.' })
  async getCategories() {
    return this.categoryService.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID with linked courses' })
  @ApiParam({ name: 'id', description: 'Category ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Category details with courses.' })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Category does not exist.',
  })
  async getCategoryById(@Param('id') id: string) {
    return this.categoryService.getCategoryById(id);
  }
}
