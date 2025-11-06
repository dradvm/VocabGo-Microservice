export class GetStartedStageRequest {
  gameLevleId: string | null;
}
export class GetStartedStageResponse {
  stageId: string;
  lessonId: string;
}
export class GetNextLessonRequest {
  lessonId: string;
}
