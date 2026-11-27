import type { AssessmentOptionDto } from '../onboarding/dto/assessment-question.dto';

const OPTION_IDS = 'abcdefghijklmnopqrstuvwxyz';

// Same ids by position as the Academy admin form, so answers saved by students keep pointing at the same slot.
export const toAssessmentOptions = (labels: string[]): AssessmentOptionDto[] =>
  labels.map((label, index) => ({
    id: OPTION_IDS[index],
    label: label.trim(),
  }));

// Stored options are JSON written by toAssessmentOptions or the Academy admin: [{ id, label }].
export const toOptionLabels = (options: unknown): string[] =>
  Array.isArray(options)
    ? options.map((option: { label?: unknown }) =>
        typeof option?.label === 'string' ? option.label : '',
      )
    : [];
