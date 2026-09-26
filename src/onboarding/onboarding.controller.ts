import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ACADEMIC_DOCUMENT_MAX_BYTES } from './academic-document';
import { OnboardingService } from './onboarding.service';
import { SaveOnboardingDto } from './dto/save-onboarding.dto';
import {
  CreateAssessmentQuestionDto,
  UpdateAssessmentQuestionDto,
} from './dto/assessment-question.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Onboarding')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('me')
  @ApiOperation({
    summary: "The logged-in learner's onboarding profile and completion status",
  })
  getMine(@Req() req: any) {
    return this.onboardingService.getMine(req.user.id);
  }

  @Post('academic-documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ACADEMIC_DOCUMENT_MAX_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary:
      'Upload one academic result image (JPG, PNG or WebP, max 5 MB); returns the fileKey to save',
  })
  @ApiResponse({ status: 400, description: 'Not a JPG, PNG or WebP image.' })
  @ApiResponse({ status: 413, description: 'Larger than 5 MB.' })
  uploadAcademicDocument(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.onboardingService.uploadAcademicDocument(req.user.id, file);
  }

  @Put()
  @ApiOperation({
    summary: 'Save the learning profile and mark onboarding complete',
  })
  save(@Req() req: any, @Body() dto: SaveOnboardingDto) {
    return this.onboardingService.save(req.user.id, dto);
  }
  @Get('assessment-questions')
  @ApiOperation({ summary: 'The onboarding quiz questions set by the admin' })
  listQuestions() {
    return this.onboardingService.listActiveQuestions();
  }

  @Get('admin/questions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin: all quiz questions, including inactive ones',
  })
  listAllQuestions() {
    return this.onboardingService.listAllQuestions();
  }

  @Post('admin/questions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: add a quiz question' })
  createQuestion(@Body() dto: CreateAssessmentQuestionDto) {
    return this.onboardingService.createQuestion(dto);
  }

  @Patch('admin/questions/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin: edit, reorder or deactivate a quiz question',
  })
  updateQuestion(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentQuestionDto,
  ) {
    return this.onboardingService.updateQuestion(id, dto);
  }

  @Delete('admin/questions/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: delete a quiz question' })
  deleteQuestion(@Param('id') id: string) {
    return this.onboardingService.deleteQuestion(id);
  }
}
