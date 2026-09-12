import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new category (Admin only)
   */
  async createCategory(dto: CreateCategoryDto) {
    const { name, description } = dto;

    const existingCategory = await this.prisma.category.findUnique({
      where: { name: name.trim() },
    });

    if (existingCategory) {
      throw new ConflictException(`Category "${name.trim()}" already exists`);
    }

    const category = await this.prisma.category.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
      },
    });

    this.logger.log(`📂 Category created successfully: ${category.name} (ID: ${category.id})`);

    return {
      message: 'Category created successfully',
      category,
    };
  }

  /**
   * Get all categories with course count
   */
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      include: {
        _count: {
          select: { courses: true },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      total: categories.length,
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        coursesCount: cat._count.courses,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
      })),
    };
  }

  /**
   * Get single category by ID with its linked courses
   */
  async getCategoryById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        courses: {
          include: {
            modules: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }

    return category;
  }
}
