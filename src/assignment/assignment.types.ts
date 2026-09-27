import type { CodeLanguage } from '../common/code-languages';
import type { AssignmentResponseType } from './assignment.constants';

/** Shape of each entry in Assignments.questions (JSON column). */
export type StoredQuestion = {
  id: string;
  question: string;
  responseType: AssignmentResponseType;
  description?: string;
  options?: string[];
  codeLanguage?: CodeLanguage;
  starterCode?: string;
};

/** Shape of each entry in AssignmentSubmission.answers (JSON column). */
export type StoredAnswer = {
  questionId: string;
  text?: string;
  choice?: string;
  fileKey?: string;
  fileName?: string;
};

export type AssignmentStatus = 'upcoming' | 'active';
