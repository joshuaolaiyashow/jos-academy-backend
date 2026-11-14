/** Letters (any script) in words joined by spaces, hyphens, apostrophes or periods — e.g. "Mary-Jane O'Brien", "J. Smith". Rejects digits. Mirrors PERSON_NAME_PATTERN on the frontend. */
export const PERSON_NAME_PATTERN =
  /^[\p{L}\p{M}]+(?:[ '’.-]+[\p{L}\p{M}]+)*\.?$/u;

export const PERSON_NAME_MESSAGE =
  'Name may only contain letters, spaces, hyphens, apostrophes and periods';
