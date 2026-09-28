import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

const HTTPS_ONLY = { protocols: ['https'], require_protocol: true };

/** Send either `url` (a shared link) or `fileUrl` + `fileName` (an upload). */
export class SubmitMilestoneDto {
  @ApiPropertyOptional({
    example: 'https://github.com/ada/robot',
    description: 'https link to the work',
  })
  @IsOptional()
  @IsUrl(HTTPS_ONLY, { message: 'url must be a valid https:// link' })
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional({
    description: 'fileUrl returned by POST /projects/:id/upload-url',
  })
  @IsOptional()
  @IsUrl(HTTPS_ONLY, { message: 'fileUrl must be a valid https:// link' })
  @MaxLength(1_000)
  fileUrl?: string;

  @ApiPropertyOptional({ example: 'robot-demo.mp4' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  notes?: string;
}
