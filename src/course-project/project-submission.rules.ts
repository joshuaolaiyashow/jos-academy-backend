import { ProjectSubmissionType } from '../generated/prisma/client';

type SubmissionRule = {
  allowsLink: boolean;
  fileTypes: ReadonlySet<string>;
  /** Shown when a learner picks a file this project type doesn't take. */
  fileTypeHint: string;
};

const RECORDING_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/webm',
]);

const ZIP_TYPES = new Set(['application/zip', 'application/x-zip-compressed']);

const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const PROJECT_SUBMISSION_RULES: Record<
  ProjectSubmissionType,
  SubmissionRule
> = {
  [ProjectSubmissionType.RECORDING]: {
    allowsLink: false,
    fileTypes: RECORDING_TYPES,
    fileTypeHint: 'Upload a video or audio recording.',
  },
  [ProjectSubmissionType.CODE]: {
    allowsLink: true,
    fileTypes: ZIP_TYPES,
    fileTypeHint: 'Upload your code as a ZIP file, or share a link.',
  },
  [ProjectSubmissionType.DOCUMENT]: {
    allowsLink: true,
    fileTypes: DOCUMENT_TYPES,
    fileTypeHint: 'Upload a PDF or Office document, or share a link.',
  },
};

/** Uploads for one learner's work on one project live under this folder. */
export const projectSubmissionPrefix = (
  projectId: string,
  userId: string,
): string => `academy/projects/submissions/${projectId}/${userId}`;
