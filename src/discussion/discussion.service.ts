import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LessonService } from '../lesson/lesson.service';
import { NotificationService } from '../notification/notification.service';
import { UserRole } from '../generated/prisma/client';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { NOTIFICATION_LINKS } from '../notification/notification-links';

const THREADS_PAGE_SIZE = 50;
const REPLY_NOTIFICATION_TYPE = 'discussion-reply';
const QUESTION_NOTIFICATION_TYPE = 'discussion-question';
const NOTIFICATION_PREVIEW_LENGTH = 120;

type DiscussionActor = { id: string; name: string; role: UserRole };

type DiscussionRow = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  user: { id: string; name: string; avatarUrl: string | null };
};

const AUTHOR_SELECT = {
  select: { id: true, name: true, avatarUrl: true },
} as const;

const preview = (body: string): string =>
  body.length > NOTIFICATION_PREVIEW_LENGTH
    ? `${body.slice(0, NOTIFICATION_PREVIEW_LENGTH)}…`
    : body;

@Injectable()
export class DiscussionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessonService: LessonService,
    private readonly notificationService: NotificationService,
  ) {}

  private toEntry(row: DiscussionRow, courseCreatorId: string | null) {
    return {
      id: row.id,
      body: row.body,
      parentId: row.parentId,
      createdAt: row.createdAt,
      author: {
        id: row.user.id,
        name: row.user.name,
        avatarUrl: row.user.avatarUrl,
        isInstructor: row.user.id === courseCreatorId,
      },
    };
  }

  async listThreads(user: DiscussionActor, lessonId: string) {
    const { courseCreatorId } = await this.lessonService.assertLessonAccess(
      user,
      lessonId,
    );

    const threads = await this.prisma.lessonDiscussion.findMany({
      where: { lessonId, parentId: null },
      orderBy: { createdAt: 'desc' },
      take: THREADS_PAGE_SIZE,
      include: {
        user: AUTHOR_SELECT,
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { user: AUTHOR_SELECT },
        },
      },
    });

    return {
      threads: threads.map((thread) => ({
        ...this.toEntry(thread, courseCreatorId),
        replies: thread.replies.map((reply) =>
          this.toEntry(reply, courseCreatorId),
        ),
      })),
    };
  }

  async post(
    user: DiscussionActor,
    lessonId: string,
    dto: CreateDiscussionDto,
  ) {
    const { lesson, courseCreatorId } =
      await this.lessonService.assertLessonAccess(user, lessonId);

    const thread = dto.parentId
      ? await this.resolveThread(dto.parentId, lessonId)
      : null;

    const created = await this.prisma.lessonDiscussion.create({
      data: {
        lessonId,
        userId: user.id,
        body: dto.body,
        parentId: thread?.id ?? null,
      },
      include: { user: AUTHOR_SELECT },
    });

    if (thread && thread.userId !== user.id) {
      await this.notificationService.createNotification(
        thread.userId,
        `${user.name} replied to your question`,
        `On "${lesson.title}": ${preview(dto.body)}`,
        REPLY_NOTIFICATION_TYPE,
        NOTIFICATION_LINKS.lesson(lesson.module.courseId, lessonId),
      );
    }
    if (!thread && courseCreatorId && courseCreatorId !== user.id) {
      await this.notificationService.createNotification(
        courseCreatorId,
        `New question from ${user.name}`,
        `On "${lesson.title}": ${preview(dto.body)}`,
        QUESTION_NOTIFICATION_TYPE,
        NOTIFICATION_LINKS.lesson(lesson.module.courseId, lessonId),
      );
    }

    return this.toEntry(created, courseCreatorId);
  }

  /** Replies are one level deep — replying to a reply joins its thread. */
  private async resolveThread(parentId: string, lessonId: string) {
    const parent = await this.prisma.lessonDiscussion.findUnique({
      where: { id: parentId },
      include: { parent: true },
    });
    if (!parent || parent.lessonId !== lessonId) {
      throw new BadRequestException(
        'The post you are replying to is not part of this lesson.',
      );
    }
    return parent.parent ?? parent;
  }
}
