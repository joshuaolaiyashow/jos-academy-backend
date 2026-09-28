import { LessonContentType } from '../generated/prisma/client';

/** Share of a video a learner must actually play before completing it. */
const VIDEO_WATCH_SHARE = 0.8;
const READING_WORDS_PER_MINUTE = 200;
const READING_FLOOR_SECONDS = 30;
const READING_CAP_SECONDS = 10 * 60;
const SECONDS_PER_MINUTE = 60;

/** Fastest playback speed credited: a video watched at 2x covers two seconds of content per real second. */
export const MAX_VIDEO_PLAYBACK_RATE = 2;

/** Longest single heartbeat credited, and slack for network delay between beats. */
export const MAX_HEARTBEAT_SECONDS = 120;
const HEARTBEAT_SLACK_SECONDS = 5;
/** A gap longer than this starts a fresh viewing session rather than crediting idle time. */
export const VIEWING_SESSION_GAP_SECONDS = 60;
/** Upper bound on a reported video length, so a bad report can't make a lesson uncompletable. */
export const MAX_VIDEO_SECONDS = 6 * 60 * 60;

type EngagementLesson = {
  contentType: LessonContentType;
  content: string | null;
  duration: number | null;
  videoSeconds: number | null;
};

const countWords = (content: string): number =>
  content
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

/** How long a learner must engage with a lesson before "Mark complete" is allowed. */
export const requiredEngagementSeconds = (lesson: EngagementLesson): number => {
  if (lesson.contentType === LessonContentType.video) {
    const lengthSeconds =
      lesson.videoSeconds ?? (lesson.duration ?? 0) * SECONDS_PER_MINUTE;
    return Math.round(lengthSeconds * VIDEO_WATCH_SHARE);
  }
  const readingSeconds = Math.round(
    (countWords(lesson.content ?? '') / READING_WORDS_PER_MINUTE) *
      SECONDS_PER_MINUTE,
  );
  return Math.min(
    READING_CAP_SECONDS,
    Math.max(READING_FLOOR_SECONDS, readingSeconds),
  );
};

/**
 * Seconds to credit for one heartbeat: never more than was reported, the
 * per-beat cap, or the wall-clock time since the previous beat (times the
 * fastest allowed playback rate) — so a client can't claim time it didn't spend.
 */
export const creditableSeconds = (
  reportedSeconds: number,
  lastHeartbeatAt: Date | null,
  now: Date,
  maxRate = 1,
): number => {
  const sinceLastBeat = lastHeartbeatAt
    ? ((now.getTime() - lastHeartbeatAt.getTime()) / 1000 +
        HEARTBEAT_SLACK_SECONDS) *
      maxRate
    : 0;
  return Math.max(
    0,
    Math.floor(Math.min(reportedSeconds, MAX_HEARTBEAT_SECONDS, sinceLastBeat)),
  );
};
