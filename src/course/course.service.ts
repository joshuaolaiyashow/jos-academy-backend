import 'multer';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { PaymentService } from 'src/payment/payment.service';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /**
   * Create a new course with optional heroImage file upload, category, and nested modules
   */
  async createCourse(dto: CreateCourseDto, heroImageFile?: Express.Multer.File) {
    const { modules, heroImage, categoryId, ...courseData } = dto;

    // Verify category exists if categoryId is provided
    if (categoryId) {
      const categoryExists = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!categoryExists) {
        throw new BadRequestException(`Category with ID "${categoryId}" does not exist`);
      }
    }

    let heroImageName = courseData.heroImageName;

    // If hero image file is uploaded, upload to AWS S3
    if (heroImageFile) {
      const uploadResult = await this.fileUploadService.uploadFile(
        heroImageFile,
        'courses',
      );
      heroImageName = uploadResult.url;
    }

    const course = await this.prisma.course.create({
      data: {
        ...courseData,
        heroImageName,
        categoryId: categoryId || undefined,
        modules:
          modules && modules.length > 0
            ? {
                create: modules.map((mod) => ({
                  title: mod.title,
                  description: mod.description,
                  lessonsCount: mod.lessonsCount,
                  assignmentsCount: mod.assignmentsCount,
                })),
              }
            : undefined,
      },
      include: {
        category: true,
        modules: true,
      },
    });

    this.logger.log(`🎓 Course created successfully: ${course.name} (ID: ${course.id})`);
    return {
      message: 'Course created successfully',
      course,
    };
  }

  /**
   * Get all courses with their category and modules, optionally filtered by categoryId
   */
  async getCourses(categoryId?: string) {
    const whereClause = categoryId ? { categoryId } : {};

    const courses = await this.prisma.course.findMany({
      where: whereClause,
      include: {
        category: true,
        modules: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      total: courses.length,
      filteredByCategory: categoryId || null,
      courses,
    };
  }

  /**
   * Get single course details by ID including category and modules
   */
  async getCourseById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        category: true,
        modules: true,
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }

    return course;
  }
}