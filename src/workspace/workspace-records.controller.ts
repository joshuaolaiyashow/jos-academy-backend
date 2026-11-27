import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminService } from '../admin/admin.service';
import { CategoryService } from '../category/category.service';
import { CreateCategoryDto } from '../category/dto/create-category.dto';
import { UpdateCategoryDto } from '../category/dto/update-category.dto';
import { CreateCreatorDto } from '../creator/dto/create-creator.dto';
import { CreatorService } from '../creator/creator.service';
import { DiscountService } from '../discount/discount.service';
import { UserRole } from '../generated/prisma/client';
import { PaginatedSearchQueryDto } from '../utils/pagination';
import { WorkspaceAccountsQueryDto } from './dto/workspace.dto';
import { WorkspaceAuthGuard } from './workspace-auth.guard';
import { WORKSPACE_ADMIN_PATH } from './workspace.constants';
import { WorkspaceRecordsService } from './workspace-records.service';
import {
  pageInMemory,
  type WorkspacePage,
  type WorkspaceRecord,
} from './workspace-page';

type WorkspaceRows = { data: unknown[] };

/**
 * Creators, categories and the related-list tabs on workspace records, in the JOS Workspace contract shape.
 * The workspace guard maps the first path segment to the module grant, so tabs need only the module's view grant.
 */
@ApiTags('JOS Workspace')
@ApiBearerAuth('JWT-auth')
@Controller(WORKSPACE_ADMIN_PATH)
@UseGuards(WorkspaceAuthGuard)
export class WorkspaceRecordsController {
  constructor(
    private readonly admin: AdminService,
    private readonly creators: CreatorService,
    private readonly categories: CategoryService,
    private readonly discounts: DiscountService,
    private readonly records: WorkspaceRecordsService,
  ) {}

  @Get('students/:id/programs')
  async studentPrograms(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    return { data: await this.records.studentPrograms(id) };
  }

  @Get('students/:id/payments')
  async studentPayments(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    return { data: await this.records.studentPayments(id) };
  }

  @Get('students/:id/rewards')
  async studentRewards(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    return { data: await this.records.studentRewards(id) };
  }

  @Get('creators')
  @ApiOperation({
    summary: 'Creators (workspace); search matches name or email',
  })
  async listCreators(
    @Query() query: WorkspaceAccountsQueryDto,
  ): Promise<WorkspacePage<unknown>> {
    const { creators } = await this.creators.getCreators();
    return pageInMemory(creators, query, ['name', 'email'], {
      isSuspended: query.isSuspended,
    });
  }

  @Get('creators/:id')
  async readCreator(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return { data: await this.creators.getCreatorById(id) };
  }

  @Post('creators')
  @ApiOperation({
    summary: 'Add a creator; they get an email with a temporary password',
  })
  async createCreator(
    @Body() dto: CreateCreatorDto,
  ): Promise<WorkspaceRecord<unknown>> {
    return { data: await this.creators.createCreator(dto) };
  }

  @Patch('creators/:id/suspend')
  async suspendCreator(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return {
      data: await this.admin.updateUserStatus(
        id,
        UserRole.INSTRUCTOR,
        'suspended',
      ),
    };
  }

  @Patch('creators/:id/reactivate')
  async reactivateCreator(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return {
      data: await this.admin.updateUserStatus(
        id,
        UserRole.INSTRUCTOR,
        'active',
      ),
    };
  }

  @Get('creators/:id/programs')
  async creatorPrograms(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    return { data: await this.records.creatorPrograms(id) };
  }

  @Get('creators/:id/reviews')
  async creatorReviews(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    return { data: await this.records.creatorReviews(id) };
  }

  @Get('categories')
  async listCategories(
    @Query() query: PaginatedSearchQueryDto,
  ): Promise<WorkspacePage<unknown>> {
    const { categories } = await this.categories.getCategories();
    return pageInMemory(categories, query, ['name', 'description']);
  }

  @Get('categories/:id')
  async readCategory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRecord<unknown>> {
    return { data: await this.categories.getCategoryById(id) };
  }

  @Post('categories')
  async createCategory(
    @Body() dto: CreateCategoryDto,
  ): Promise<WorkspaceRecord<unknown>> {
    const { category } = await this.categories.createCategory(dto);
    return { data: category };
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<WorkspaceRecord<unknown>> {
    const { category } = await this.categories.updateCategory(id, dto);
    return { data: category };
  }

  @Delete('categories/:id')
  async deleteCategory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.categories.deleteCategory(id);
  }

  @Get('programs/:id/lessons')
  async programLessons(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    return { data: await this.records.programLessons(id) };
  }

  @Get('programs/:id/students')
  async programStudents(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    return { data: await this.records.programStudents(id) };
  }

  @Get('campaigns/:id/redemptions')
  async campaignRedemptions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    const { redemptions } = await this.discounts.listCampaignRedemptions(id);
    return {
      data: redemptions.map(({ user, ...redemption }) => ({
        ...redemption,
        name: user.name,
        email: user.email,
      })),
    };
  }

  @Get('campaigns/:id/invitees')
  async campaignInvitees(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceRows> {
    const { invitees } = await this.discounts.listInvitees(id);
    return { data: invitees };
  }
}
