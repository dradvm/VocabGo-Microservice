export class GetStartedStageRequest {
  gameLevelId: string | null;
}
export class GetStartedStageResponse {
  stageId: string;
  lessonId: string;
}
export class GetGameLevelWithStages {
  gameLevel: GameLevel;
}
export class GetGameLevelsWithStages {
  gameLevels: GameLevel[];
}
export class GameLevel {
  gameLevelId: string;
  stage: {
    stageId: string;
  }[];
}
export class GetNextLessonRequest {
  lessonId: string;
}
export class GetNextLessonResponse {
  lessonId: string;
  stageId: string;
}
