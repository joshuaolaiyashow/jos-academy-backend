import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DiscountService } from './discount.service';
import { ValidateDiscountDto } from './dto/validate-discount.dto';
import {
  CreateDiscountCampaignDto,
  UpdateDiscountCampaignDto,
} from './dto/create-discount-campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Discounts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('discounts')
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Post('validate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check a discount code and preview the discounted price',
  })
  validate(@Req() req: any, @Body() dto: ValidateDiscountDto) {
    return this.discountService.validate(req.user.id, dto);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Campaigns currently running that the student can use',
  })
  listActive(@Req() req: any) {
    return this.discountService.listActive(req.user.id);
  }

  @Get('my-redemptions')
  @ApiOperation({ summary: "The logged-in student's discount usage history" })
  myRedemptions(@Req() req: any) {
    return this.discountService.myRedemptions(req.user.id);
  }

  @Get('admin/campaigns')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'All campaigns with redemption counts (Admin)' })
  listCampaigns() {
    return this.discountService.listCampaigns();
  }

  @Post('admin/campaigns')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a discount campaign (Admin)' })
  createCampaign(@Req() req: any, @Body() dto: CreateDiscountCampaignDto) {
    return this.discountService.createCampaign(req.user.id, dto);
  }

  @Patch('admin/campaigns/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit, pause or resume a campaign (Admin)' })
  updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateDiscountCampaignDto,
  ) {
    return this.discountService.updateCampaign(id, dto);
  }

  @Get('admin/campaigns/:id/redemptions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Which students used a campaign (Admin)' })
  listRedemptions(@Param('id') id: string) {
    return this.discountService.listCampaignRedemptions(id);
  }
}
