import sanitizeHtml from 'sanitize-html';

// Exactly what the creator's note editor toolbar can produce; anything else is stripped.
const NOTE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2',
    'h3',
    'p',
    'br',
    'strong',
    'em',
    'u',
    's',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'hr',
    'a',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer',
    }),
  },
};

/** Note lessons are rich text rendered to learners, so their HTML is cleaned before it is stored. */
export const sanitizeNoteHtml = (html: string): string =>
  sanitizeHtml(html, NOTE_HTML_OPTIONS);
