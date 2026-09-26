import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

import { Notification } from '../generated/prisma/client';

const NOTIFICATION_CHANNEL = 'academy:notifications';
// Under the load balancer's default 60s idle timeout, so quiet streams aren't cut.
const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Fans newly created notifications out to open SSE streams. With REDIS_URL set, every
 * backend instance publishes to and subscribes on one channel, so a user connected to
 * any ECS task receives it; without it, events only reach this instance's streams.
 */
@Injectable()
export class NotificationEventsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationEventsService.name);
  private readonly notifications = new Subject<Notification>();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  onModuleInit(): void {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL is not set — live notifications only reach users connected to this instance.',
      );
      return;
    }

    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
    for (const client of [this.publisher, this.subscriber]) {
      // ioredis crashes the process on an unhandled 'error' event; reconnects on its own.
      client.on('error', (error: Error) =>
        this.logger.error(`Redis connection error: ${error.message}`),
      );
    }

    this.subscriber.on('message', (_channel: string, payload: string) => {
      // Dates arrive as ISO strings; they are only re-serialized to the client.
      this.notifications.next(JSON.parse(payload) as Notification);
    });
    this.subscriber
      .subscribe(NOTIFICATION_CHANNEL)
      .catch((error: Error) =>
        this.logger.error(
          `Could not subscribe to live notifications: ${error.message}`,
        ),
      );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.publisher?.quit(), this.subscriber?.quit()]);
  }

  publish(notification: Notification): void {
    if (!this.publisher) {
      this.notifications.next(notification);
      return;
    }
    // The row is already saved; a failed publish only delays the user seeing it until refresh.
    this.publisher
      .publish(NOTIFICATION_CHANNEL, JSON.stringify(notification))
      .catch((error: Error) =>
        this.logger.error(
          `Could not publish live notification: ${error.message}`,
        ),
      );
  }

  streamFor(userId: string): Observable<MessageEvent> {
    const forUser = this.notifications.pipe(
      filter((notification) => notification.userId === userId),
      map((notification): MessageEvent => ({
        type: 'notification',
        data: notification,
      })),
    );
    const heartbeat = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: '' })),
    );
    return merge(forUser, heartbeat);
  }
}
