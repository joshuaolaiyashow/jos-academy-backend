import { LessonVideoStatus } from '../generated/prisma/client';

export type TranscodeCallbackStatus = 'playable' | 'ready' | 'failed';

interface LessonVideoUpdate {
  videoUrl?: string;
  videoProcessingStatus?: LessonVideoStatus;
  videoProcessingError?: string | null;
}

/**
 * 'playable' means the low-resolution rungs are live while HD still encodes: students can
 * watch, so the URL is saved, but the status is left alone — it stays PENDING until 'ready'
 * (and a late 'playable' retry can never move a READY lesson backwards). 'failed' keeps any
 * URL already saved, so a lesson that was playable stays watchable at low quality.
 */
export const buildLessonVideoUpdate = (
  status: TranscodeCallbackStatus,
  outputUrl?: string,
  error?: string,
): LessonVideoUpdate => {
  if (status === 'failed') {
    return {
      videoProcessingStatus: LessonVideoStatus.FAILED,
      videoProcessingError: error,
    };
  }
  if (status === 'playable') {
    return { videoUrl: outputUrl };
  }
  return {
    videoUrl: outputUrl,
    videoProcessingStatus: LessonVideoStatus.READY,
    videoProcessingError: null,
  };
};
