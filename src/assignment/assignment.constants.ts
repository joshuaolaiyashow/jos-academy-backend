export const ASSIGNMENT_RESPONSE_TYPES = [
  'Short response',
  'Long response',
  'File upload',
  'Multiple choice',
  'Coding exercise',
] as const;

export type AssignmentResponseType = (typeof ASSIGNMENT_RESPONSE_TYPES)[number];

export const MULTIPLE_CHOICE: AssignmentResponseType = 'Multiple choice';
export const FILE_UPLOAD: AssignmentResponseType = 'File upload';
export const CODING_EXERCISE: AssignmentResponseType = 'Coding exercise';

/** Shown where a legacy assignment row has no title. */
export const UNTITLED_ASSIGNMENT = 'Untitled assignment';

export const MIN_CHOICE_OPTIONS = 2;
export const ANSWER_TEXT_MAX_LENGTH = 10_000;
export const STARTER_CODE_MAX_LENGTH = 10_000;
export const SUBMISSION_NOTES_MAX_LENGTH = 5_000;
export const FEEDBACK_MAX_LENGTH = 5_000;
export const MAX_ASSIGNMENT_SCORE = 1_000;
export const MAX_ASSIGNMENT_QUESTIONS = 50;
export const ASSIGNMENT_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const SUBMISSION_FILE_FOLDER = 'assignment-submissions';

/** Documents, images, archives and plain data only; nothing a browser would execute (no HTML/SVG). */
export const ALLOWED_ANSWER_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Where a learner's answer files live; submissions may only reference their own prefix. */
export const submissionFilePrefix = (
  assignmentId: string,
  userId: string,
): string => `${SUBMISSION_FILE_FOLDER}/${assignmentId}/${userId}/`;
