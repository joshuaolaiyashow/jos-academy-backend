import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { SaveStudentOnboardingDto } from './dto/student-onboarding.dto';
import {
  AcademicBackgroundType,
  OnboardingStep,
} from '../generated/prisma/client';

export interface AssessmentQuestion {
  id: number;
  question: string;
  options: (string | number)[];
  correctAnswer: string | number;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  // Standard 16-Question JOS Learning Assessment
  private readonly assessmentQuestions: AssessmentQuestion[] = [
    {
      id: 1,
      question: 'What is 12 + 27?',
      options: [39, 35, 41, 29],
      correctAnswer: 39,
    },
    {
      id: 2,
      question: 'What is 15 × 6?',
      options: [80, 90, 95, 100],
      correctAnswer: 90,
    },
    {
      id: 3,
      question: 'If a car travels at 60 km/h, how far will it travel in 2.5 hours?',
      options: ['120 km', '140 km', '150 km', '160 km'],
      correctAnswer: '150 km',
    },
    {
      id: 4,
      question: 'Which number completes the sequence: 2, 4, 8, 16, __?',
      options: [24, 30, 32, 36],
      correctAnswer: 32,
    },
    {
      id: 5,
      question: 'What is 25% of 200?',
      options: [25, 40, 50, 75],
      correctAnswer: 50,
    },
    {
      id: 6,
      question: 'If 3x = 21, what is the value of x?',
      options: [5, 6, 7, 8],
      correctAnswer: 7,
    },
    {
      id: 7,
      question: 'Which of the following is an input device on a computer?',
      options: ['Monitor', 'Keyboard', 'Speaker', 'Printer'],
      correctAnswer: 'Keyboard',
    },
    {
      id: 8,
      question: 'What is 100 - 37?',
      options: [53, 63, 67, 73],
      correctAnswer: 63,
    },
    {
      id: 9,
      question: 'If John is older than Mike, and Mike is older than Sarah, who is the youngest?',
      options: ['John', 'Mike', 'Sarah', 'Cannot be determined'],
      correctAnswer: 'Sarah',
    },
    {
      id: 10,
      question: 'What is 144 ÷ 12?',
      options: [10, 11, 12, 14],
      correctAnswer: 12,
    },
    {
      id: 11,
      question: 'Which number is a prime number?',
      options: [9, 15, 17, 21],
      correctAnswer: 17,
    },
    {
      id: 12,
      question: 'What is 8 squared (8²)?',
      options: [16, 56, 64, 72],
      correctAnswer: 64,
    },
    {
      id: 13,
      question: 'If a triangle has angles 60° and 70°, what is the third angle?',
      options: ['40°', '50°', '60°', '70°'],
      correctAnswer: '50°',
    },
    {
      id: 14,
      question: 'Which unit is used to measure computer storage capacity?',
      options: ['Gigabyte (GB)', 'Watt', 'Hertz', 'Volt'],
      correctAnswer: 'Gigabyte (GB)',
    },
    {
      id: 15,
      question: 'What is 0.75 written as a fraction?',
      options: ['1/2', '2/3', '3/4', '4/5'],
      correctAnswer: '3/4',
    },
    {
      id: 16,
      question: 'If 5 books cost ₦2,500, what is the cost of 1 book?',
      options: ['₦400', '₦500', '₦600', '₦750'],
      correctAnswer: '₦500',
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /**
   * Get Standard 16-Question JOS Learning Assessment
   */
  getAssessmentQuestions() {
    return {
      title: 'JOS Learning Assessment',
      description:
        'Untimed and beginner friendly - there’s no pass or fail, this just helps us understand your starting point.',
      totalQuestions: this.assessmentQuestions.length,
      questions: this.assessmentQuestions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
      })),
    };
  }

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

    // Auto-calculate score if assessment answers provided
    let computedScore = dto.assessmentScore;
    let computedCompleted = dto.assessmentCompleted;

    if (
      dto.academicBackgroundType ===
        AcademicBackgroundType.JOS_LEARNING_ASSESSMENT &&
      dto.assessmentAnswers &&
      dto.assessmentAnswers.length > 0
    ) {
      let correctCount = 0;
      dto.assessmentAnswers.forEach((ans) => {
        const question = this.assessmentQuestions.find(
          (q) => q.id === ans.questionId,
        );
        if (
          question &&
          String(question.correctAnswer).trim() ===
            String(ans.selectedOption).trim()
        ) {
          correctCount++;
          ans.isCorrect = true;
        } else {
          ans.isCorrect = false;
        }
      });
      computedScore = correctCount;
      computedCompleted = true;
    }

    // Determine completion status
    const shouldMarkDone =
      dto.isCompleted === true ||
      dto.currentStep === OnboardingStep.DONE ||
      (dto.academicBackgroundType ===
        AcademicBackgroundType.UPLOAD_ACADEMIC_RESULTS &&
        Boolean(dto.academicResultsUrl)) ||
      (dto.academicBackgroundType ===
        AcademicBackgroundType.JOS_LEARNING_ASSESSMENT &&
        computedCompleted === true);

    const step = shouldMarkDone
      ? OnboardingStep.DONE
      : dto.currentStep ||
        user.studentOnboarding?.currentStep ||
        OnboardingStep.INTERESTS;

    const completed = shouldMarkDone ? true : user.studentOnboarding?.isCompleted || false;

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
        assessmentScore: computedScore,
        assessmentTotal: dto.assessmentTotal ?? 16,
        assessmentAnswers: dto.assessmentAnswers ? (dto.assessmentAnswers as any) : undefined,
        assessmentCompleted: computedCompleted ?? false,
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
        ...(computedScore !== undefined
          ? { assessmentScore: computedScore }
          : {}),
        ...(dto.assessmentTotal !== undefined
          ? { assessmentTotal: dto.assessmentTotal }
          : {}),
        ...(dto.assessmentAnswers !== undefined
          ? { assessmentAnswers: dto.assessmentAnswers as any }
          : {}),
        ...(computedCompleted !== undefined
          ? { assessmentCompleted: computedCompleted }
          : {}),
        currentStep: step,
        isCompleted: completed,
        ...(completed ? { completedAt: new Date() } : {}),
      },
    });

    // Update user isOnboarded status
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
   * Upload Academic Result or Portfolio Document to S3
   */
  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    documentType: 'academic_results' | 'portfolio_work',
  ) {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    const folder =
      documentType === 'academic_results'
        ? 'student-academic-results'
        : 'student-portfolios';

    const uploadResult = await this.fileUploadService.uploadFile(file, folder);

    // Automatically associate URL with the user's onboarding record
    if (documentType === 'academic_results') {
      await this.prisma.studentOnboarding.upsert({
        where: { userId },
        create: {
          userId,
          academicResultsUrl: uploadResult.url,
          academicBackgroundType: AcademicBackgroundType.UPLOAD_ACADEMIC_RESULTS,
        },
        update: {
          academicResultsUrl: uploadResult.url,
          academicBackgroundType: AcademicBackgroundType.UPLOAD_ACADEMIC_RESULTS,
        },
      });
    } else {
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
    }

    return {
      message: 'Document uploaded successfully',
      url: uploadResult.url,
      documentType,
      fileName: uploadResult.originalName,
      fileSize: uploadResult.size,
    };
  }
}
