import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EnrollmentService } from './enrollment.service';
import { PurchaseCourseDto } from './dto/purchase-course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Enrollment & Purchases')
@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Purchase Course or Specific Module using Credits (Wallet Balance)',
    description:
      'Deducts the required credits from the student’s wallet balance and instantly unlocks the full course or chosen module.',
  })
  @ApiResponse({
    status: 201,
    description: 'Course or module unlocked successfully.',
    schema: {
      example: {
        message: 'Module "Frontend Basics" purchased successfully with credits!',
        courseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        courseName: 'Full-Stack Web Development Bootcamp',
        purchaseType: 'MODULAR',
        moduleId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        creditsDeducted: 1000,
        remainingBalance: 4000,
        remainingNairaEquivalent: 40000,
        reference: 'JOS-PUR-1725700000000-A1B2C3',
        enrollmentId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad Request - Insufficient credits or missing required fields.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Already owns full course or this specific module.',
  })
  async purchaseCourse(
    @Req() req: any,
    @Body() purchaseDto: PurchaseCourseDto,
  ) {
    return this.enrollmentService.purchaseWithCredits(req.user.id, purchaseDto);
  }

  @Get('my-courses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get all enrolled courses & unlocked modules for the logged-in student',
  })
  @ApiResponse({
    status: 200,
    description: 'List of student enrollments with unlocked module list.',
  })
  async getMyEnrollments(@Req() req: any) {
    return this.enrollmentService.getMyEnrollments(req.user.id);
  }

  @Get('check-access')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Check if the logged-in student has access to a specific course module',
  })
  @ApiQuery({ name: 'courseId', required: true, example: 'uuid' })
  @ApiQuery({ name: 'moduleId', required: true, example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Returns access boolean status.',
  })
  async checkAccess(
    @Req() req: any,
    @Query('courseId') courseId: string,
    @Query('moduleId') moduleId: string,
  ) {
    return this.enrollmentService.checkModuleAccess(
      req.user.id,
      courseId,
      moduleId,
    );
  }
}
