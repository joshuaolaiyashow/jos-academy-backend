import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderModulesDto {
  @ApiProperty({
    type: [String],
    description: "Every one of the program's module IDs, in the new order",
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  moduleIds: string[];
}
