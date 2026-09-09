import 'multer';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { CreateCourseDto } from './dto/create-course.dto';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /**
   * Create a new course with optional heroImage file upload and nested modules
   */
  async createCourse(dto: CreateCourseDto, heroImageFile?: Express.Multer.File) {
    const { modules, heroImage, ...courseData } = dto;

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
   * Get all courses with their modules
   */
  async getCourses() {
    const courses = await this.prisma.course.findMany({
      include: {
        modules: true,
      },
    });

    return {
      total: courses.length,
      courses,
    };
  }

  /**
   * Get single course details by ID
   */
  async getCourseById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        modules: true,
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }

    return course;
  }
}