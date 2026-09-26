import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SubmitMilestoneDto {
  @ApiProperty({
    example: 'https://github.com/ada/robot',
    description: 'https link to the work',
  })
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'url must be a valid https:// link' },
  )
  @MaxLength(500)
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  notes?: string;
}
