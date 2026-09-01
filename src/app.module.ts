import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { CourseModule } from './course/course.module';
import { CreatorModule } from './creator/creator.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationModule, CourseModule, CreatorModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
