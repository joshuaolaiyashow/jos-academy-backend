/** Languages a code lesson can be written in. Mirrors CODE_LANGUAGES on the frontend. */
export const CODE_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'go',
  'html',
  'css',
  'json',
  'sql',
  'markdown',
] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];
