import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EnrollmentService } from './enrollment.service';
import { PaymentService } from '../payment/payment.service';
import { InitiateEnrollmentDto } from './dto/initiate-enrollment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Enrollment & Payments')
@Controller('enrollments')
export class EnrollmentController {
  constructor(
    private readonly enrollmentService: EnrollmentService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Initiate course enrollment (Full Course or Module-by-Module) and get Paystack payment URL',
  })
  @ApiResponse({
    status: 201,
    description: 'Enrollment initiated. Redirect user to authorizationUrl.',
    schema: {
      example: {
        message: 'Enrollment initiated successfully. Please complete payment.',
        authorizationUrl: 'https://checkout.paystack.com/xxxxxx',
        accessCode: 'xxxxxx',
        reference: 'JOS-ENR-1725700000000-A1B2C3D4',
        amount: 50000,
        courseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        courseName: 'Full-Stack Web Development Bootcamp',
        enrollmentType: 'FULL_COURSE',
        moduleId: null,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Missing moduleId or invalid data.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - User already purchased full course or module.',
  })
  async initiateEnrollment(
    @Req() req: any,
    @Body() initiateDto: InitiateEnrollmentDto,
  ) {
    return this.enrollmentService.initiateEnrollment(req.user.id, initiateDto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Paystack webhook listener (automatically activates enrollment upon payment)',
  })
  @ApiHeader({
    name: 'x-paystack-signature',
    description: 'HMAC SHA512 signature from Paystack',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Webhook received and processed.' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature.' })
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
  ) {
    const isValid = this.paymentService.verifyWebhookSignature(signature, body);
    if (!isValid) {
      throw new BadRequestException('Invalid Paystack webhook signature');
    }
    return this.enrollmentService.handleWebhook(body);
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
