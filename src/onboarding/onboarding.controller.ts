import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { OnboardingService } from './onboarding.service';
import { SaveStudentOnboardingDto } from './dto/student-onboarding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Student Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Save or complete student onboarding progress',
    description: `Saves the student onboarding credentials across any or all of the 5 onboarding steps:
1. **Interests**: Learning interests (Robotics, AI/ML and Automation, Software Engineering, Aerospace Engineering, Cybersecurity, Other)
2. **Education**: Education level (Junior Secondary School, Senior Secondary School, Polytechnic, University, Graduate, Working Professional, Other)
3. **Experience**: Practical experience & portfolio/work URL
4. **Academic Background Selection**: Option to upload results (WAEC, NECO, transcripts) OR take JOS Learning Assessment
5. **Assessment & Completion**: Assessment answers/score, marking onboarding as completed.`,
  })
  @ApiResponse({
    status: 201,
    description: 'Onboarding data saved successfully.',
    schema: {
      example: {
        message: '🎉 Student onboarding completed successfully!',
        isOnboarded: true,
        currentStep: 'DONE',
        onboarding: {
          id: 'b3c4d5e6-f7a8-9012-cdef-123456789012',
          userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          interests: [
            'Software Engineering',
            'AI/ML and Automation',
            'Robotics',
          ],
          otherInterest: null,
          educationLevel: 'UNIVERSITY',
          otherEducationLevel: null,
          practicalExperience: 'COMPLETED_PERSONAL_PROJECTS',
          workPortfolioUrl: 'https://github.com/student/robotics-demo',
          workAttachmentUrl: null,
          academicBackgroundType: 'JOS_LEARNING_ASSESSMENT',
          academicResultsUrl: null,
          academicResultsType: null,
          assessmentScore: 14,
          assessmentTotal: 16,
          assessmentCompleted: true,
          currentStep: 'DONE',
          isCompleted: true,
          completedAt: '2026-09-23T15:30:00.000Z',
          createdAt: '2026-09-23T15:28:00.000Z',
          updatedAt: '2026-09-23T15:30:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation error in payload.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid JWT token.',
  })
  async saveOnboarding(
    @Req() req: any,
    @Body() dto: SaveStudentOnboardingDto,
  ) {
    return this.onboardingService.saveOnboarding(req.user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current student onboarding progress and saved details',
    description:
      'Retrieves the student’s current onboarding step, completion status, and all saved answers.',
  })
  @ApiResponse({
    status: 200,
    description: 'Onboarding profile details.',
    schema: {
      example: {
        isOnboarded: true,
        currentStep: 'DONE',
        isCompleted: true,
        onboarding: {
          id: 'b3c4d5e6-f7a8-9012-cdef-123456789012',
          userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          interests: ['Robotics', 'Software Engineering'],
          educationLevel: 'UNIVERSITY',
          practicalExperience: 'COMPLETED_PERSONAL_PROJECTS',
          academicBackgroundType: 'JOS_LEARNING_ASSESSMENT',
          assessmentScore: 14,
          assessmentTotal: 16,
          isCompleted: true,
        },
      },
    },
  })
  async getOnboarding(@Req() req: any) {
    return this.onboardingService.getOnboarding(req.user.id);
  }

  @Post('upload-document')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload Academic Results or Portfolio Work file to AWS S3',
    description:
      'Uploads a file (PDF, image, document) to AWS S3 and links it directly to the student’s onboarding profile.',
  })
  @ApiQuery({
    name: 'type',
    enum: ['academic_results', 'portfolio_work'],
    required: true,
    description:
      'Type of document being uploaded: "academic_results" (WAEC/NECO/transcripts) or "portfolio_work" (project work upload)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document or image file to upload',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully and saved to student profile.',
    schema: {
      example: {
        message: 'Document uploaded successfully',
        url: 'https://jos-academy.s3.us-east-1.amazonaws.com/student-academic-results/1727100000000-uuid-waec.pdf',
        documentType: 'academic_results',
        fileName: 'waec.pdf',
        fileSize: 245800,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No file provided or invalid file.' })
  async uploadDocument(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type: 'academic_results' | 'portfolio_work' = 'academic_results',
  ) {
    return this.onboardingService.uploadDocument(req.user.id, file, type);
  }

  @Get('assessment-questions')
  @ApiOperation({
    summary: 'Get 16 JOS Learning Assessment questions',
    description:
      'Fetches the 16 beginner-friendly assessment questions with multiple choice options for students taking the assessment path.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of 16 learning assessment questions.',
    schema: {
      example: {
        title: 'JOS Learning Assessment',
        description:
          'Untimed and beginner friendly - there’s no pass or fail, this just helps us understand your starting point.',
        totalQuestions: 16,
        questions: [
          {
            id: 1,
            question: 'What is 12 + 27?',
            options: [39, 35, 41, 29],
          },
          {
            id: 2,
            question: 'What is 15 × 6?',
            options: [80, 90, 95, 100],
          },
        ],
      },
    },
  })
  getAssessmentQuestions() {
    return this.onboardingService.getAssessmentQuestions();
  }
}
