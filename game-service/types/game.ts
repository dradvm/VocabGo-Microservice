export class GameLevelRequest {
  gameLevelName: string;
  gameLevelDescription: string;
}
export class StageRequest {
  stageName: string;
  wordPosIds: string[];
}
export class LessonRequest {
  lessonName: string;
  lessonReward: number;
  lessonTypeId: string;
  questions: LessonQuestion[];
}
export class LessonQuestion {
  questionId: string;
  questionCount: number;
}
