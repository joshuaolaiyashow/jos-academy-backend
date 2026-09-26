import { PartialType } from '@nestjs/swagger';

import { CreateCourseModuleDto } from './create-module.dto';

export class UpdateCourseModuleDto extends PartialType(CreateCourseModuleDto) {}
