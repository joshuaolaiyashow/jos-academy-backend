import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationStreamQueryDto } from './dto/notification-stream-query.dto';
import { NotificationEventsService } from './notification-events.service';
import { NotificationStreamTokenService } from './notification-stream-token.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationEvents: NotificationEventsService,
    private readonly streamTokens: NotificationStreamTokenService,
  ) {}

  @Post('stream-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get a 60-second token for opening the live notification stream',
  })
  @ApiResponse({ status: 201, description: 'Stream token issued.' })
  async createStreamToken(@Req() req: any) {
    return this.streamTokens.issue(req.user.id);
  }

  @Sse('stream')
  @ApiOperation({
    summary:
      'Server-Sent Events stream of the user’s new notifications (auth via ?token=)',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired stream token.' })
  async stream(
    @Query() query: NotificationStreamQueryDto,
  ): Promise<Observable<MessageEvent>> {
    const userId = await this.streamTokens.verify(query.token);
    return this.notificationEvents.streamFor(userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get the logged-in user’s notifications' })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    example: true,
    description: 'When true, only return unread notifications',
  })
  @ApiResponse({
    status: 200,
    description: 'List of notifications for the current user.',
  })
  async listNotifications(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationService.listForUser(req.user.id, query);
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Mark all of the logged-in user’s unread notifications as read',
  })
  @ApiResponse({
    status: 200,
    description: 'All unread notifications marked as read.',
  })
  async markAllRead(@Req() req: any) {
    const { count } = await this.notificationService.markAllRead(req.user.id);
    return { message: 'All notifications marked as read', count };
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  @ApiResponse({
    status: 404,
    description:
      'Not Found - Notification does not exist or is not owned by the user.',
  })
  async markRead(@Req() req: any, @Param('id') id: string) {
    const notification = await this.notificationService.markRead(
      req.user.id,
      id,
    );
    return { message: 'Notification marked as read', notification };
  }
}
