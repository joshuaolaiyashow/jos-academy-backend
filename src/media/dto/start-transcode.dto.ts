import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class StartTranscodeDto {
  @ApiProperty({
    description:
      'The `fileUrl` returned by POST /media/upload-url after the raw file was PUT there',
    example: 'https://.../academy/lessons/uploads/1234-intro-lesson.mp4',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  sourceUrl: string;
}
