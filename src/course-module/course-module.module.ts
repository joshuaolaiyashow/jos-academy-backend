import { Module } from '@nestjs/common';

import { CourseAccessModule } from '../course-access/course-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseModuleController } from './course-module.controller';
import { CourseModuleService } from './course-module.service';

@Module({
  imports: [PrismaModule, CourseAccessModule],
  providers: [CourseModuleService],
  controllers: [CourseModuleController],
})
export class CourseModuleModule {}
