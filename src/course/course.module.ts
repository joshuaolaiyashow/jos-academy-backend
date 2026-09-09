import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FileUploadModule } from '../file-upload/file-upload.module';

@Module({
  imports: [PrismaModule, FileUploadModule],
  providers: [CourseService],
  controllers: [CourseController],
  exports: [CourseService],
})
export class CourseModule {}
