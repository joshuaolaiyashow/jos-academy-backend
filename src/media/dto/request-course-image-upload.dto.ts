import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const COURSE_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export class RequestCourseImageUploadDto {
  @ApiProperty({ example: 'robotics-hero.png' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ enum: COURSE_IMAGE_CONTENT_TYPES })
  @IsIn(COURSE_IMAGE_CONTENT_TYPES, {
    message: 'Upload a JPEG, PNG or WebP image',
  })
  contentType: string;
}
