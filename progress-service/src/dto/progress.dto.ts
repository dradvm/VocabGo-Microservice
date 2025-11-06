export class InitApplicationStageProgressRequest {
  userId: string;
}

export class DoneLessonRequest {
  userLessonProgressId: string;
  kp?: number;
  timeSpent?: number;
  accuracyRate?: number;
}
