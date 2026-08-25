import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [JwtModule, PrismaModule, NotificationModule],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
