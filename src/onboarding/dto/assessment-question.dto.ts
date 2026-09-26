import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AssessmentOptionDto {
  @ApiProperty({ example: 'a' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: '39' })
  @IsString()
  @IsNotEmpty()
  label: string;
}

export class CreateAssessmentQuestionDto {
  @ApiProperty({ example: 'mathematics' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ example: 'What is 12 + 27?' })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({ type: [AssessmentOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => AssessmentOptionDto)
  options: AssessmentOptionDto[];

  @ApiPropertyOptional({
    description: 'Position in the quiz; appended last when omitted',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAssessmentQuestionDto extends PartialType(
  CreateAssessmentQuestionDto,
) {}
