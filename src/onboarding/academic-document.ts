import { BadRequestException } from '@nestjs/common';

export const ACADEMIC_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

/** Mirrors AcademicRecordType on the frontend (types/onboarding.ts). */
export const ACADEMIC_RECORD_TYPES = [
  'waec',
  'neco',
  'nabteb',
  'bece',
  'jss-report-card',
  'university-transcript',
  'semester-result',
  'other',
] as const;

/** Every result a student uploads lives under their own folder; saves are checked against it. */
export const academicDocumentFolder = (userId: string): string =>
  `onboarding/${userId}/academic-documents`;

/**
 * The browser-supplied mimetype is just a label, so the file's first bytes decide:
 * a renamed PDF or script can't slip through as "photo.jpg".
 */
const IMAGE_SIGNATURES: {
  mimeType: string;
  matches: (bytes: Buffer) => boolean;
}[] = [
  {
    mimeType: 'image/jpeg',
    matches: (bytes) =>
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    matches: (bytes) =>
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/webp',
    matches: (bytes) =>
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export const assertAcademicDocumentImage = (
  file: Express.Multer.File | undefined,
): void => {
  if (!file)
    throw new BadRequestException('Choose an image of your result to upload.');
  const signature = IMAGE_SIGNATURES.find(({ matches }) =>
    matches(file.buffer),
  );
  if (!signature || signature.mimeType !== file.mimetype) {
    throw new BadRequestException(
      'Upload your result as a JPG, PNG or WebP image.',
    );
  }
};
