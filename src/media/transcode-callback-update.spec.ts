import { LessonVideoStatus } from '../generated/prisma/client';
import { buildLessonVideoUpdate } from './transcode-callback-update';

const MASTER_URL = 'https://cdn.example.com/lessons/1/index.m3u8';

describe('buildLessonVideoUpdate', () => {
  it('saves the URL on playable without touching the status', () => {
    const update = buildLessonVideoUpdate('playable', MASTER_URL);

    expect(update).toEqual({ videoUrl: MASTER_URL });
    expect(update).not.toHaveProperty('videoProcessingStatus');
  });

  it('marks the lesson READY and clears the error on ready', () => {
    expect(buildLessonVideoUpdate('ready', MASTER_URL)).toEqual({
      videoUrl: MASTER_URL,
      videoProcessingStatus: LessonVideoStatus.READY,
      videoProcessingError: null,
    });
  });

  it('marks FAILED with the error and keeps any saved URL on failed', () => {
    const update = buildLessonVideoUpdate('failed', undefined, 'ffmpeg exited');

    expect(update).toEqual({
      videoProcessingStatus: LessonVideoStatus.FAILED,
      videoProcessingError: 'ffmpeg exited',
    });
    expect(update).not.toHaveProperty('videoUrl');
  });
});
