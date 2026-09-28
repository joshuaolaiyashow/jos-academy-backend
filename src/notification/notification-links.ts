/**
 * Frontend paths a notification opens. The `tab` values must match the dashboard
 * tab slugs in jos-academy (lowercased tab label, spaces as hyphens).
 */
export const NOTIFICATION_LINKS = {
  adminProgramReview: (courseId: string) =>
    `/admin/programs/${courseId}/review`,
  adminApplications: () => '/admin?tab=applications',
  creatorPrograms: () => '/creator-dashboard?tab=programs',
  creatorAssignments: () => '/creator-dashboard?tab=assignments',
  creatorProjects: () => '/creator-dashboard?tab=projects',
  lesson: (courseId: string, lessonId: string) =>
    `/programs/${courseId}/lessons/${lessonId}`,
  creatorLesson: (courseId: string, lessonId: string) =>
    `/creator-dashboard/programs/${courseId}/lessons/${lessonId}`,
  assignment: (courseId: string, assignmentId: string) =>
    `/programs/${courseId}/assignments/${assignmentId}`,
  certificate: (certificateId: string) => `/certificates/${certificateId}`,
  program: (courseId: string) => `/programs/${courseId}`,
  learnerDashboard: () => '/dashboard',
  liveRoom: (sessionId: string) => `/live/${sessionId}`,
} as const;
