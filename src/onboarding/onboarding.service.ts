import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import {
  AcademicDocumentItemDto,
  SaveStudentOnboardingDto,
} from './dto/student-onboarding.dto';
import {
  AcademicBackgroundType,
  OnboardingStep,
} from '../generated/prisma/client';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /**
   * Save or Update Student Onboarding Data (Supports step-by-step or all-at-once)
   */
  async saveOnboarding(userId: string, dto: SaveStudentOnboardingDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentOnboarding: true },
    });
  
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Determine completion status
    const shouldMarkDone =
      dto.isCompleted === true ||
      dto.currentStep === OnboardingStep.DONE ||
      (dto.academicBackgroundType ===
        AcademicBackgroundType.UPLOAD_ACADEMIC_RESULTS &&
        (Boolean(dto.academicResultsUrl) ||
          (Array.isArray(dto.academicDocuments) &&
            dto.academicDocuments.length > 0))) ||
      (dto.academicBackgroundType ===
        AcademicBackgroundType.JOS_LEARNING_ASSESSMENT &&
        dto.assessmentCompleted === true);

    const step = shouldMarkDone
      ? OnboardingStep.DONE
      : dto.currentStep ||
        user.studentOnboarding?.currentStep ||
        OnboardingStep.INTERESTS;

    const completed =
      shouldMarkDone || user.studentOnboarding?.isCompleted || false;

    // Merge academic documents if provided
    let documentsToSave = dto.academicDocuments;
    if (!documentsToSave && user.studentOnboarding?.academicDocuments) {
      documentsToSave = user.studentOnboarding
        .academicDocuments as unknown as AcademicDocumentItemDto[];
    }

    // Upsert StudentOnboarding record
    const onboarding = await this.prisma.studentOnboarding.upsert({
      where: { userId },
      create: {
        userId,
        interests: dto.interests ?? [],
        otherInterest: dto.otherInterest,
        educationLevel: dto.educationLevel,
        otherEducationLevel: dto.otherEducationLevel,
        practicalExperience: dto.practicalExperience,
        workPortfolioUrl: dto.workPortfolioUrl,
        workAttachmentUrl: dto.workAttachmentUrl,
        academicBackgroundType: dto.academicBackgroundType,
        academicResultsUrl: dto.academicResultsUrl,
        academicResultsType: dto.academicResultsType,
        academicDocuments: documentsToSave ? (documentsToSave as any) : undefined,
        assessmentScore: dto.assessmentScore,
        assessmentTotal: dto.assessmentTotal ?? 16,
        assessmentAnswers: dto.assessmentAnswers
          ? (dto.assessmentAnswers as any)
          : undefined,
        assessmentCompleted: dto.assessmentCompleted ?? false,
        currentStep: step,
        isCompleted: completed,
        completedAt: completed ? new Date() : null,
      },
      update: {
        ...(dto.interests !== undefined ? { interests: dto.interests } : {}),
        ...(dto.otherInterest !== undefined
          ? { otherInterest: dto.otherInterest }
          : {}),
        ...(dto.educationLevel !== undefined
          ? { educationLevel: dto.educationLevel }
          : {}),
        ...(dto.otherEducationLevel !== undefined
          ? { otherEducationLevel: dto.otherEducationLevel }
          : {}),
        ...(dto.practicalExperience !== undefined
          ? { practicalExperience: dto.practicalExperience }
          : {}),
        ...(dto.workPortfolioUrl !== undefined
          ? { workPortfolioUrl: dto.workPortfolioUrl }
          : {}),
        ...(dto.workAttachmentUrl !== undefined
          ? { workAttachmentUrl: dto.workAttachmentUrl }
          : {}),
        ...(dto.academicBackgroundType !== undefined
          ? { academicBackgroundType: dto.academicBackgroundType }
          : {}),
        ...(dto.academicResultsUrl !== undefined
          ? { academicResultsUrl: dto.academicResultsUrl }
          : {}),
        ...(dto.academicResultsType !== undefined
          ? { academicResultsType: dto.academicResultsType }
          : {}),
        ...(documentsToSave !== undefined
          ? { academicDocuments: documentsToSave as any }
          : {}),
        ...(dto.assessmentScore !== undefined
          ? { assessmentScore: dto.assessmentScore }
          : {}),
        ...(dto.assessmentTotal !== undefined
          ? { assessmentTotal: dto.assessmentTotal }
          : {}),
        ...(dto.assessmentAnswers !== undefined
          ? { assessmentAnswers: dto.assessmentAnswers as any }
          : {}),
        ...(dto.assessmentCompleted !== undefined
          ? { assessmentCompleted: dto.assessmentCompleted }
          : {}),
        currentStep: step,
        isCompleted: completed,
        ...(completed ? { completedAt: new Date() } : {}),
      },
    });

    // Update user isOnboarded status in User table
    if (completed && !user.isOnboarded) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isOnboarded: true },
      });
    }

    this.logger.log(
      `👤 Student onboarding updated for ${user.email}: Step = ${onboarding.currentStep}, Completed = ${onboarding.isCompleted}`,
    );

    return {
      message: onboarding.isCompleted
        ? '🎉 Student onboarding completed successfully!'
        : 'Onboarding progress saved successfully.',
      isOnboarded: onboarding.isCompleted,
      currentStep: onboarding.currentStep,
      onboarding,
    };
  }

  /**
   * Get Student Onboarding Progress & Data
   */
  async getOnboarding(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentOnboarding: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.studentOnboarding) {
      return {
        isOnboarded: false,
        currentStep: OnboardingStep.INTERESTS,
        isCompleted: false,
        onboarding: null,
      };
    }

    return {
      isOnboarded: user.isOnboarded,
      currentStep: user.studentOnboarding.currentStep,
      isCompleted: user.studentOnboarding.isCompleted,
      onboarding: user.studentOnboarding,
    };
  }

  /**
   * Upload Academic Result or Portfolio Document to S3 and save to user's profile
   * @param documentType Selected document type (e.g. WAEC, NECO, NABTEB, BECE, TRANSCRIPT, PORTFOLIO, OTHER)
   */
  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    documentType: string = 'WAEC',
  ) {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    const isPortfolio =
      documentType.toUpperCase() === 'PORTFOLIO' ||
      documentType.toUpperCase() === 'PORTFOLIO_WORK';

    const folder = isPortfolio
      ? 'student-portfolios'
      : 'student-academic-results';

    const uploadResult = await this.fileUploadService.uploadFile(file, folder);

    // Fetch existing onboarding record
    const onboarding = await this.prisma.studentOnboarding.findUnique({
      where: { userId },
    });

    if (isPortfolio) {
      await this.prisma.studentOnboarding.upsert({
        where: { userId },
        create: {
          userId,
          workAttachmentUrl: uploadResult.url,
        },
        update: {
          workAttachmentUrl: uploadResult.url,
        },
      });
    } else {
      // Manage list of uploaded academic documents
      const existingDocs: AcademicDocumentItemDto[] =
        (onboarding?.academicDocuments as unknown as AcademicDocumentItemDto[]) ||
        [];

      const newDoc: AcademicDocumentItemDto = {
        documentType: documentType.toUpperCase(),
        fileUrl: uploadResult.url,
        fileName: uploadResult.originalName,
        fileSize: uploadResult.size,
      };

      const updatedDocs = [...existingDocs, newDoc];

      await this.prisma.studentOnboarding.upsert({
        where: { userId },
        create: {
          userId,
          academicBackgroundType: AcademicBackgroundType.UPLOAD_ACADEMIC_RESULTS,
          academicResultsUrl: uploadResult.url,
          academicResultsType: documentType.toUpperCase(),
          academicDocuments: updatedDocs as any,
        },
        update: {
          academicBackgroundType: AcademicBackgroundType.UPLOAD_ACADEMIC_RESULTS,
          academicResultsUrl: uploadResult.url,
          academicResultsType: documentType.toUpperCase(),
          academicDocuments: updatedDocs as any,
        },
      });
    }

    return {
      message: `${documentType.toUpperCase()} document uploaded and saved successfully.`,
      url: uploadResult.url,
      documentType: documentType.toUpperCase(),
      fileName: uploadResult.originalName,
      fileSize: uploadResult.size,
    };
  }

  /**
   * Delete an uploaded academic document by its file URL
   */
  async deleteAcademicDocument(userId: string, fileUrl: string) {
    const onboarding = await this.prisma.studentOnboarding.findUnique({
      where: { userId },
    });

    if (!onboarding || !onboarding.academicDocuments) {
      throw new NotFoundException('No academic documents found to delete.');
    }

    const docs: AcademicDocumentItemDto[] =
      onboarding.academicDocuments as unknown as AcademicDocumentItemDto[];

    const updatedDocs = docs.filter((doc) => doc.fileUrl !== fileUrl);

    await this.prisma.studentOnboarding.update({
      where: { userId },
      data: {
        academicDocuments: updatedDocs as any,
        ...(onboarding.academicResultsUrl === fileUrl
          ? {
              academicResultsUrl:
                updatedDocs.length > 0 ? updatedDocs[0].fileUrl : null,
              academicResultsType:
                updatedDocs.length > 0 ? updatedDocs[0].documentType : null,
            }
          : {}),
      },
    });

    return {
      message: 'Document removed from onboarding profile successfully.',
      remainingDocuments: updatedDocs,
    };
  }
}
