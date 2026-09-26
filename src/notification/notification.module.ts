import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationEventsService } from './notification-events.service';
import { NotificationStreamTokenService } from './notification-stream-token.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  // Secrets are passed per call by NotificationStreamTokenService; importing AuthModule
  // here instead would be circular (AuthModule imports this module).
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationEventsService,
    NotificationStreamTokenService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
