import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export const MODULE_TITLE_MAX_LENGTH = 200;
export const MODULE_DESCRIPTION_MAX_LENGTH = 2000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCourseModuleDto {
  @ApiProperty({ example: 'Module 3: Sensors and actuators' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Module title is required' })
  @MaxLength(MODULE_TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({ example: 'Wire up and read common sensors.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Module description is required' })
  @MaxLength(MODULE_DESCRIPTION_MAX_LENGTH)
  description: string;

  @ApiProperty({
    example: 6,
    description:
      'How many lessons this module will have; lessons can be added up to this number',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'A module needs at least 1 lesson' })
  lessonsCount: number;
}
