import {
  Body,
  Controller,
  Delete,
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
    description: `Saves the student onboarding credentials across any or all of the onboarding steps:
1. **Interests**: Learning interests (Robotics, AI/ML and Automation, Software Engineering, Aerospace Engineering, Cybersecurity, Other)
2. **Education**: Education level (Junior Secondary School, Senior Secondary School, Polytechnic, University, Graduate, Working Professional, Other)
3. **Experience**: Practical experience & portfolio/work URL or attachment
4. **Academic Background**: Upload results (WAEC, NECO, NABTEB, BECE, transcripts) OR take frontend learning assessment
5. **Completion**: Assessment answers/score, saving full profile and marking onboarding as completed.`,
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
          academicBackgroundType: 'UPLOAD_ACADEMIC_RESULTS',
          academicDocuments: [
            {
              documentType: 'WAEC',
              fileUrl:
                'https://jos-academy.s3.us-east-1.amazonaws.com/student-academic-results/waec.pdf',
              fileName: 'waec.pdf',
              fileSize: 245800,
            },
          ],
          academicResultsUrl:
            'https://jos-academy.s3.us-east-1.amazonaws.com/student-academic-results/waec.pdf',
          academicResultsType: 'WAEC',
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
      'Retrieves the student’s current onboarding step, completion status, uploaded academic documents, and all saved answers.',
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
          academicBackgroundType: 'UPLOAD_ACADEMIC_RESULTS',
          academicDocuments: [
            {
              documentType: 'WAEC',
              fileUrl:
                'https://jos-academy.s3.us-east-1.amazonaws.com/student-academic-results/waec.pdf',
              fileName: 'waec.pdf',
              fileSize: 245800,
            },
          ],
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
    summary:
      'Upload Academic Result document (WAEC, NECO, NABTEB, BECE, Transcripts, Other) to S3',
    description: `Uploads a document (PDF, PNG, JPG) to AWS S3 and automatically saves it with the chosen document type (e.g. WAEC, NECO, NABTEB, BECE, TRANSCRIPT, OTHER, PORTFOLIO) into the student's profile.
Students can call this multiple times to add multiple documents.`,
  })
  @ApiQuery({
    name: 'documentType',
    required: false,
    example: 'WAEC',
    description:
      'Document type selected from dropdown: "WAEC", "NECO", "NABTEB", "BECE", "TRANSCRIPT", "OTHER", or "PORTFOLIO"',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document or certificate file to upload (PDF, PNG, JPG)',
        },
        documentType: {
          type: 'string',
          example: 'WAEC',
          description:
            'Optional: Document type (e.g. WAEC, NECO, NABTEB, BECE, TRANSCRIPT, OTHER)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Document uploaded to S3 and saved to student profile.',
    schema: {
      example: {
        message: 'WAEC document uploaded and saved successfully.',
        url: 'https://jos-academy.s3.us-east-1.amazonaws.com/student-academic-results/1727100000000-uuid-waec.pdf',
        documentType: 'WAEC',
        fileName: 'waec.pdf',
        fileSize: 245800,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No file provided or invalid file.' })
  async uploadDocument(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('documentType') queryDocType?: string,
    @Body('documentType') bodyDocType?: string,
  ) {
    const documentType = bodyDocType || queryDocType || 'WAEC';
    return this.onboardingService.uploadDocument(
      req.user.id,
      file,
      documentType,
    );
  }

  @Delete('academic-document')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Remove an uploaded academic document from onboarding profile',
    description:
      'Removes a specific document from the student’s list of uploaded academic results.',
  })
  @ApiQuery({
    name: 'fileUrl',
    required: true,
    description: 'The S3 fileUrl of the document to remove',
    example:
      'https://jos-academy.s3.us-east-1.amazonaws.com/student-academic-results/waec.pdf',
  })
  @ApiResponse({
    status: 200,
    description: 'Document removed successfully.',
  })
  async deleteAcademicDocument(
    @Req() req: any,
    @Query('fileUrl') fileUrl: string,
  ) {
    return this.onboardingService.deleteAcademicDocument(req.user.id, fileUrl);
  }
}
