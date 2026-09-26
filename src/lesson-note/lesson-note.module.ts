import { Module } from '@nestjs/common';
import { LessonNoteService } from './lesson-note.service';
import { LessonNoteController } from './lesson-note.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LessonModule } from '../lesson/lesson.module';

@Module({
  imports: [PrismaModule, LessonModule],
  providers: [LessonNoteService],
  controllers: [LessonNoteController],
})
export class LessonNoteModule {}
