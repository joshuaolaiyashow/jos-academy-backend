import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { MODULE_ORDER_BY } from '../course-module/module-order';

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

    this.logger.log(
      `📂 Category created successfully: ${category.name} (ID: ${category.id})`,
    );

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

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.findCategoryOrThrow(id);
    const name = dto.name?.trim();

    if (name) {
      const clash = await this.prisma.category.findFirst({
        where: { name, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException(`Category "${name}" already exists`);
      }
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: { name, description: dto.description?.trim() },
    });

    this.logger.log(`📂 Category updated: ${category.name} (ID: ${id})`);
    return { message: 'Category updated successfully', category };
  }

  // Blocked while courses use it: the FK is onDelete SetNull, so deleting would silently uncategorise them.
  async deleteCategory(id: string) {
    await this.findCategoryOrThrow(id);
    const coursesCount = await this.prisma.course.count({
      where: { categoryId: id },
    });

    if (coursesCount > 0) {
      throw new ConflictException(
        `Category is used by ${coursesCount} program(s). Move them to another category first.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
    this.logger.log(`📂 Category deleted (ID: ${id})`);
    return { message: 'Category deleted successfully' };
  }

  private async findCategoryOrThrow(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }
    return category;
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
            modules: { orderBy: MODULE_ORDER_BY },
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
