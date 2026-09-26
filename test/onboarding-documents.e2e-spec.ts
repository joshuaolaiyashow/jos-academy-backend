import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { FileUploadService } from '../src/file-upload/file-upload.service';
import { UserRole } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader as auth,
  createE2eApp,
  seedUser,
  type SeededUser,
} from './e2e-helpers';

/** Stands in for S3: returns the key the real service would build. */
const fakeFileUpload = {
  uploadFile: (file: Express.Multer.File, folder: string) =>
    Promise.resolve({
      url: `https://bucket.test/${folder}/${file.originalname}`,
      key: `${folder}/${file.originalname}`,
      bucket: 'bucket',
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    }),
};

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest-of-png'),
]);

describe('Onboarding academic documents (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let student: SeededUser;
  let otherStudent: SeededUser;

  const http = () => request(app.getHttpServer());
  const upload = (
    user: SeededUser,
    bytes: Buffer,
    filename: string,
    contentType: string,
  ) =>
    http()
      .post('/onboarding/academic-documents')
      .set(auth(user))
      .attach('file', bytes, { filename, contentType });

  beforeAll(async () => {
    app = await createE2eApp([
      { token: FileUploadService, value: fakeFileUpload },
    ]);
    prisma = app.get(PrismaService);
    student = await seedUser(app, 'onboarding-student', UserRole.USER);
    otherStudent = await seedUser(app, 'onboarding-other', UserRole.USER);
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a real image and files it under the student', async () => {
    const response = await upload(
      student,
      PNG_BYTES,
      'waec.png',
      'image/png',
    ).expect(201);
    expect(response.body).toEqual({
      fileKey: `onboarding/${student.id}/academic-documents/waec.png`,
      fileName: 'waec.png',
    });
  });

  it('rejects a PDF', async () => {
    await upload(
      student,
      Buffer.from('%PDF-1.7 result'),
      'waec.pdf',
      'application/pdf',
    ).expect(400);
  });

  it('rejects a non-image renamed and labelled as a PNG', async () => {
    await upload(
      student,
      Buffer.from('<script>alert(1)</script>'),
      'waec.png',
      'image/png',
    ).expect(400);
  });

  it('saves records pointing at the student’s own uploads', async () => {
    await http()
      .put('/onboarding')
      .set(auth(student))
      .send({
        academicBackgroundType: 'UPLOAD_ACADEMIC_RESULTS',
        academicDocuments: [
          {
            id: randomUUID(),
            type: 'waec',
            fileName: 'waec.png',
            fileKey: `onboarding/${student.id}/academic-documents/waec.png`,
          },
        ],
      })
      .expect(200);

    const saved = await prisma.studentOnboarding.findUniqueOrThrow({
      where: { userId: student.id },
    });
    expect(saved.academicDocuments).toEqual([
      expect.objectContaining({
        type: 'waec',
        fileKey: expect.stringContaining(student.id),
      }),
    ]);
  });

  it("refuses a record that points at someone else's upload", async () => {
    await http()
      .put('/onboarding')
      .set(auth(otherStudent))
      .send({
        academicDocuments: [
          {
            id: randomUUID(),
            type: 'waec',
            fileName: 'waec.png',
            fileKey: `onboarding/${student.id}/academic-documents/waec.png`,
          },
        ],
      })
      .expect(400);
  });
});
