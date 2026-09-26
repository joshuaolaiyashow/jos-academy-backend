import { BadRequestException } from '@nestjs/common';

type ModuleLessonTally = {
  title: string;
  lessonsCount: number;
  _count: { lessons: number };
};

/**
 * `lessonsCount` is the number of lessons the creator promised for a module when
 * planning the program, and learners see it on the program page, so a module
 * can't hold more lessons than planned.
 */
export const assertRoomForLesson = (
  module: { title: string; lessonsCount: number },
  existingLessons: number,
): void => {
  if (existingLessons >= module.lessonsCount) {
    throw new BadRequestException(
      `"${module.title}" is planned for ${module.lessonsCount} lesson${module.lessonsCount === 1 ? '' : 's'}. Raise the module's lesson count to add more.`,
    );
  }
};

/** Modules whose real lessons don't match the plan, e.g. `"Sensors": 3 of 5 lessons`. */
export const describeLessonPlanGaps = (
  modules: ModuleLessonTally[],
): string[] =>
  modules
    .filter((module) => module._count.lessons !== module.lessonsCount)
    .map(
      (module) =>
        `"${module.title}": ${module._count.lessons} of ${module.lessonsCount} lessons`,
    );
