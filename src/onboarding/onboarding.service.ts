import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingStep, Prisma } from '../generated/prisma/client';
import { FileUploadService } from '../file-upload/file-upload.service';
import {
  academicDocumentFolder,
  assertAcademicDocumentImage,
} from './academic-document';
import { SaveOnboardingDto } from './dto/save-onboarding.dto';
import {
  CreateAssessmentQuestionDto,
  UpdateAssessmentQuestionDto,
} from './dto/assessment-question.dto';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUpload: FileUploadService,
  ) {}

  /** The learner's saved profile, or a not-completed stub when they haven't started. */
  async getMine(userId: string) {
    const onboarding = await this.prisma.studentOnboarding.findUnique({
      where: { userId },
    });
    if (!onboarding) {
      return { isCompleted: false, currentStep: OnboardingStep.INTERESTS };
    }
    return onboarding;
  }

  /** Stores one result image under the student's own folder; the key goes into the saved profile. */
  async uploadAcademicDocument(userId: string, file: Express.Multer.File) {
    assertAcademicDocumentImage(file);
    const uploaded = await this.fileUpload.uploadFile(
      file,
      academicDocumentFolder(userId),
    );
    return { fileKey: uploaded.key, fileName: file.originalname };
  }

  /** Saves the full learning profile and marks onboarding complete. Safe to call again to update it. */
  async save(userId: string, dto: SaveOnboardingDto) {
    const ownFolder = `${academicDocumentFolder(userId)}/`;
    if (
      dto.academicDocuments?.some(
        (document) => !document.fileKey.startsWith(ownFolder),
      )
    ) {
      throw new BadRequestException(
        'Upload each result before saving; a record can only point at your own uploads.',
      );
    }

    const workSamples = dto.workSamples as Prisma.InputJsonValue | undefined;
    const firstSampleUrl = dto.workSamples?.find(
      (sample) => typeof sample.url === 'string',
    )?.url as string | undefined;

    const data = {
      interests: dto.interests ?? [],
      otherInterest: dto.otherInterest,
      educationLevel: dto.educationLevel,
      institutionName: dto.institutionName,
      currentClassOrLevel: dto.currentClassOrLevel,
      expectedGraduationYear: dto.expectedGraduationYear,
      practicalExperience: dto.practicalExperience,
      workSamples,
      workPortfolioUrl: firstSampleUrl,
      academicBackgroundType: dto.academicBackgroundType,
      academicDocuments: dto.academicDocuments?.map((document) => ({
        ...document,
      })),
      assessmentAnswers: dto.assessmentAnswers as
        Prisma.InputJsonValue | undefined,
      assessmentCompleted: Boolean(dto.assessmentAnswers?.length),
      currentStep: OnboardingStep.DONE,
      isCompleted: true,
      completedAt: new Date(),
    };

    return this.prisma.studentOnboarding.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
  /** Questions learners answer during onboarding, in the order the admin set. */
  listActiveQuestions() {
    return this.prisma.assessmentQuestion.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  listAllQuestions() {
    return this.prisma.assessmentQuestion.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createQuestion(dto: CreateAssessmentQuestionDto) {
    const order = dto.order ?? (await this.prisma.assessmentQuestion.count());
    return this.prisma.assessmentQuestion.create({
      data: {
        subject: dto.subject.trim(),
        prompt: dto.prompt.trim(),
        options: dto.options as unknown as Prisma.InputJsonValue,
        order,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateQuestion(id: string, dto: UpdateAssessmentQuestionDto) {
    await this.requireQuestion(id);
    return this.prisma.assessmentQuestion.update({
      where: { id },
      data: {
        subject: dto.subject?.trim(),
        prompt: dto.prompt?.trim(),
        options: dto.options as unknown as Prisma.InputJsonValue | undefined,
        order: dto.order,
        isActive: dto.isActive,
      },
    });
  }

  async deleteQuestion(id: string) {
    await this.requireQuestion(id);
    await this.prisma.assessmentQuestion.delete({ where: { id } });
    return { message: 'Question deleted' };
  }

  private async requireQuestion(id: string) {
    const question = await this.prisma.assessmentQuestion.findUnique({
      where: { id },
    });
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }
}
