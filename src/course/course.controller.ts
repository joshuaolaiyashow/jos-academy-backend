import 'multer';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Course')
@Controller('course')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('heroImage', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit for course hero image
      },
    }),
  )
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new course with optional hero image file upload and category (Admin only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: CreateCourseDto,
    description: 'Course creation data with optional heroImage file and categoryId',
  })
  @ApiResponse({ status: 201, description: 'Course created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation error or non-existent category.' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Token missing or invalid.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only Admin role can create courses.' })
  async createCourse(
    @Body() createCourseDto: CreateCourseDto,
    @UploadedFile() heroImage?: Express.Multer.File,
  ) {
    return this.courseService.createCourse(createCourseDto, heroImage);
  }

  @Get()
  @ApiOperation({ summary: 'Get all courses (optionally filtered by category)' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Optional Category ID to filter courses by category',
  })
  @ApiResponse({ status: 200, description: 'List of all matching courses with category and modules.' })
  async getCourses(@Query('categoryId') categoryId?: string) {
    return this.courseService.getCourses(categoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a course by ID' })
  @ApiParam({ name: 'id', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Course details.' })
  @ApiResponse({ status: 404, description: 'Not Found - Course does not exist.' })
  async getCourseById(@Param('id') id: string) {
    return this.courseService.getCourseById(id);
  }
}
