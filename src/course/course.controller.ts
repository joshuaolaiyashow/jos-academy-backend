import 'multer';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
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
import { UpdateCourseDto } from './dto/update-course.dto';
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
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @UseInterceptors(
    FileInterceptor('heroImage', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit for course hero image
      },
    }),
  )
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Create a new course with optional hero image file upload and category (Admin or Instructor)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: CreateCourseDto,
    description:
      'Course creation data with optional heroImage file and categoryId',
  })
  @ApiResponse({ status: 201, description: 'Course created successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation error or non-existent category.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Token missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only Admin or Instructor role can create courses.',
  })
  async createCourse(
    @Req() req: any,
    @Body() createCourseDto: CreateCourseDto,
    @UploadedFile() heroImage?: Express.Multer.File,
  ) {
    return this.courseService.createCourse(
      createCourseDto,
      req.user.id,
      heroImage,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all courses (optionally filtered by category)',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Optional Category ID to filter courses by category',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all matching courses with category and modules.',
  })
  async getCourses(@Query('categoryId') categoryId?: string) {
    return this.courseService.getCourses(categoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a course by ID' })
  @ApiParam({ name: 'id', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Course details.' })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Course does not exist.',
  })
  async getCourseById(@Param('id') id: string) {
    return this.courseService.getCourseById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @UseInterceptors(
    FileInterceptor('heroImage', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Update a course's own fields (creator or Admin only)",
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateCourseDto })
  @ApiParam({ name: 'id', description: 'Course ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Course updated successfully.' })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Not this course's creator.",
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Course does not exist.',
  })
  async updateCourse(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @UploadedFile() heroImage?: Express.Multer.File,
  ) {
    return this.courseService.updateCourse(
      id,
      updateCourseDto,
      req.user,
      heroImage,
    );
  }
}
