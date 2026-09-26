import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LessonService } from '../lesson/lesson.service';
import { UserRole } from '../generated/prisma/client';

type NoteAuthor = { id: string; role: UserRole };

@Injectable()
export class LessonNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessonService: LessonService,
  ) {}

  async getNote(user: NoteAuthor, lessonId: string) {
    await this.lessonService.assertLessonAccess(user, lessonId);

    const note = await this.prisma.lessonNote.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId } },
    });
    return { content: note?.content ?? '', updatedAt: note?.updatedAt ?? null };
  }

  async saveNote(user: NoteAuthor, lessonId: string, content: string) {
    await this.lessonService.assertLessonAccess(user, lessonId);

    const note = await this.prisma.lessonNote.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      create: { userId: user.id, lessonId, content },
      update: { content },
    });
    return { content: note.content, updatedAt: note.updatedAt };
  }
}
