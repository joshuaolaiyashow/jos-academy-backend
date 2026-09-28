import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  type WebhookEvent,
} from 'livekit-server-sdk';

const ROOM_NAME_PREFIX = 'session-';
/** Tokens outlive the scheduled slot so a session that runs over doesn't lock people out. */
const TOKEN_GRACE_MINUTES = 120;
const SECONDS_PER_MINUTE = 60;
/** Keeps an open waiting room alive briefly if the host's connection drops. */
const ROOM_EMPTY_TIMEOUT_SECONDS = 10 * 60;

type LiveKitConfig = {
  /** wss:// URL the browser connects to — LiveKit Cloud now, a self-hosted server later. */
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
};

/** Room metadata clients read to know whether the class has started. */
export type LiveRoomState = {
  status: 'WAITING' | 'LIVE';
  startedAt: string | null;
};

export type LiveKitJoinGrant = {
  serverUrl: string;
  roomName: string;
  token: string;
};

const readConfig = (): LiveKitConfig | null => {
  const serverUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!serverUrl || !apiKey || !apiSecret) return null;
  return { serverUrl, apiKey, apiSecret };
};

/** The server API speaks HTTP on the same host the browser reaches over WebSocket. */
const toHttpUrl = (serverUrl: string): string =>
  serverUrl.replace(/^ws(s?):\/\//, 'http$1://');

/**
 * The only place that talks to LiveKit. Switching from LiveKit Cloud to a
 * self-hosted server is a change of LIVEKIT_URL/KEY/SECRET, nothing else.
 */
@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private readonly config = readConfig();
  private readonly roomService = this.config
    ? new RoomServiceClient(
        toHttpUrl(this.config.serverUrl),
        this.config.apiKey,
        this.config.apiSecret,
      )
    : null;
  private readonly webhookReceiver = this.config
    ? new WebhookReceiver(this.config.apiKey, this.config.apiSecret)
    : null;

  constructor() {
    if (!this.config) {
      this.logger.warn(
        'LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not set — JOS Live sessions are disabled.',
      );
    }
  }

  assertConfigured(): LiveKitConfig {
    if (!this.config) {
      throw new ServiceUnavailableException(
        'JOS Live is not set up yet. Use Zoom, Google Meet or Teams for now.',
      );
    }
    return this.config;
  }

  sessionIdFromRoom(roomName: string): string | null {
    return roomName.startsWith(ROOM_NAME_PREFIX)
      ? roomName.slice(ROOM_NAME_PREFIX.length)
      : null;
  }

  async createJoinToken(options: {
    sessionId: string;
    durationMins: number;
    userId: string;
    userName: string;
    isHost: boolean;
  }): Promise<LiveKitJoinGrant> {
    const config = this.assertConfigured();
    const roomName = `${ROOM_NAME_PREFIX}${options.sessionId}`;

    const accessToken = new AccessToken(config.apiKey, config.apiSecret, {
      // The user id, so webhook join/leave events map straight onto attendance rows.
      identity: options.userId,
      name: options.userName,
      metadata: JSON.stringify({ isHost: options.isHost }),
      ttl: (options.durationMins + TOKEN_GRACE_MINUTES) * SECONDS_PER_MINUTE,
    });
    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      // Learners can speak and share too: workshops and Q&A need it. Only the host can moderate.
      canPublish: true,
      canPublishData: true,
      roomAdmin: options.isHost,
    });

    return {
      serverUrl: config.serverUrl,
      roomName,
      token: await accessToken.toJwt(),
    };
  }

  /**
   * Creates the room when the host opens the waiting room, carrying the
   * session status in its metadata so connected clients react without polling.
   */
  async openRoom(sessionId: string, state: LiveRoomState): Promise<void> {
    if (!this.roomService) return;
    try {
      await this.roomService.createRoom({
        name: `${ROOM_NAME_PREFIX}${sessionId}`,
        metadata: JSON.stringify(state),
        emptyTimeout: ROOM_EMPTY_TIMEOUT_SECONDS,
      });
    } catch (error) {
      this.logger.warn(
        `Could not open LiveKit room for session ${sessionId}: ${String(error)}`,
      );
    }
  }

  /** Pushes a status change (e.g. waiting → live) to everyone connected. */
  async updateRoomState(
    sessionId: string,
    state: LiveRoomState,
  ): Promise<void> {
    if (!this.roomService) return;
    try {
      await this.roomService.updateRoomMetadata(
        `${ROOM_NAME_PREFIX}${sessionId}`,
        JSON.stringify(state),
      );
    } catch (error) {
      this.logger.warn(
        `Could not update LiveKit room for session ${sessionId}: ${String(error)}`,
      );
    }
  }

  /** Disconnects everyone still in the room once the host ends the session. */
  async closeRoom(sessionId: string): Promise<void> {
    if (!this.roomService) return;
    try {
      await this.roomService.deleteRoom(`${ROOM_NAME_PREFIX}${sessionId}`);
    } catch (error) {
      // The room may never have been opened (nobody joined) — ending the session must still succeed.
      this.logger.warn(
        `Could not close LiveKit room for session ${sessionId}: ${String(error)}`,
      );
    }
  }

  /** Verifies the signed webhook against the exact bytes LiveKit sent. */
  async receiveWebhook(
    rawBody: string,
    authorization: string | undefined,
  ): Promise<WebhookEvent> {
    this.assertConfigured();
    return this.webhookReceiver!.receive(rawBody, authorization);
  }
}
