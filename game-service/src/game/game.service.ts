import { Injectable } from '@nestjs/common';
import { game_level } from '@prisma/client';
import { GetStartedStageResponse } from 'src/dto/game.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { GameLevelRequest, StageRequest } from 'types/game';
@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

  async getStartedStage(
    gameLevelId: string | null
  ): Promise<GetStartedStageResponse | null> {
    let gameLevel: game_level | null;
    if (gameLevelId) {
      gameLevel = await this.prisma.game_level.findUnique({
        where: {
          game_level_id: gameLevelId
        }
      });
    } else {
      gameLevel = await this.prisma.game_level.findFirst({
        orderBy: { level_order: 'asc' }
      });
    }
    if (gameLevel != null) {
      const stage = await this.prisma.stage.findFirst({
        where: {
          is_active: true,
          game_level_id: gameLevel.game_level_id
        },
        include: {
          lesson: {
            orderBy: {
              lesson_order: 'asc'
            }
          }
        }
      });

      return {
        stageId: stage?.stage_id ?? '',
        lessonId: stage?.lesson[0].lesson_id ?? ''
      };
    }
    return null;
  }

  async getGameLevels() {
    return this.prisma.game_level.findMany({
      orderBy: {
        level_order: 'asc'
      }
    });
  }
  async getGameLevelStages(levelId: string) {
    return this.prisma.stage.findMany({
      where: {
        game_level_id: levelId,
        is_active: true
      },
      orderBy: {
        stage_order: 'asc'
      },
      include: {
        lesson: {
          orderBy: {
            lesson_order: 'asc'
          },
          include: {
            lesson_type: true,
            lesson_question: {
              include: {
                question: {
                  include: {
                    difficulty: true
                  }
                }
              }
            }
          }
        },
        stage_word: true,
        game_level: true
      }
    });
  }
  async getGameLevelsWithStages() {
    const gameLevels = await this.prisma.game_level.findMany({
      select: {
        game_level_id: true,
        stage: {
          where: {
            is_active: true
          },
          select: {
            stage_id: true
          }
        }
      }
    });
    return {
      gameLevels: gameLevels.map((gameLevel) => {
        return {
          gameLevelId: gameLevel.game_level_id,
          stage: gameLevel.stage.map((s) => {
            return {
              stageId: s.stage_id
            };
          })
        };
      })
    };
  }
  async getNextLesson(lessonId: string) {
    const currentLesson = await this.prisma.lesson.findUnique({
      where: { lesson_id: lessonId },
      include: {
        stage: {
          include: { game_level: true }
        }
      }
    });

    if (!currentLesson) {
      return { lessonId: '', stageId: '' };
    }

    const { stage, lesson_order } = currentLesson;
    const { game_level } = stage;

    // --- 1️⃣ Lấy bài tiếp theo trong cùng stage ---
    let nextLesson = await this.prisma.lesson.findFirst({
      where: {
        stage_id: stage.stage_id,
        lesson_order: { gt: lesson_order }
      },
      orderBy: { lesson_order: 'asc' }
    });

    if (nextLesson) {
      return { lessonId: nextLesson.lesson_id, stageId: nextLesson.stage_id };
    }

    // --- 2️⃣ Nếu hết bài trong stage, tìm stage tiếp theo trong cùng game level ---
    const nextStage = await this.prisma.stage.findFirst({
      where: {
        is_active: true,
        game_level_id: game_level.game_level_id,
        stage_order: { gt: stage.stage_order }
      },
      include: {
        lesson: {
          orderBy: { lesson_order: 'asc' },
          take: 1
        }
      }
    });

    if (nextStage?.lesson?.length) {
      nextLesson = nextStage.lesson[0];
      return { lessonId: nextLesson.lesson_id, stageId: nextLesson.stage_id };
    }

    // --- 3️⃣ Nếu hết stage, tìm game level tiếp theo ---
    const nextGameLevel = await this.prisma.game_level.findFirst({
      where: { level_order: { gt: game_level.level_order } }
    });

    if (nextGameLevel) {
      nextLesson = await this.prisma.lesson.findFirst({
        where: { stage: { game_level_id: nextGameLevel.game_level_id } },
        orderBy: [{ stage: { stage_order: 'asc' } }, { lesson_order: 'asc' }]
      });

      if (nextLesson) {
        return { lessonId: nextLesson.lesson_id, stageId: nextLesson.stage_id };
      }
    }

    // --- 4️⃣ Nếu không còn gì để học ---
    return { lessonId: '', stageId: '' };
  }

  async updateGameLevelOrder(gameLevelIds: string[]) {
    return Promise.all(
      gameLevelIds.map((gameLevelId, index) =>
        this.prisma.game_level.update({
          where: {
            game_level_id: gameLevelId
          },
          data: {
            level_order: index + 1
          }
        })
      )
    );
  }

  async addGameLevel(gameLevel: GameLevelRequest) {
    const order = await this.prisma.game_level.count();

    return this.prisma.game_level.create({
      data: {
        game_level_name: gameLevel.gameLevelName,
        game_level_description: gameLevel.gameLevelDescription,
        level_order: order + 1
      }
    });
  }

  async updateGameLevel(gameLevelId: string, gameLevel: GameLevelRequest) {
    return this.prisma.game_level.update({
      where: {
        game_level_id: gameLevelId
      },
      data: {
        game_level_name: gameLevel.gameLevelName,
        game_level_description: gameLevel.gameLevelDescription
      }
    });
  }
  async deleteGameLevel(gameLevelId: string) {
    return this.prisma.game_level.delete({
      where: {
        game_level_id: gameLevelId
      }
    });
  }

  async updateStageOrder(gameLevelId: string, stages: string[]) {
    return Promise.all(
      stages.map((stageId, index) =>
        this.prisma.stage.update({
          where: {
            stage_id: stageId,
            game_level_id: gameLevelId
          },
          data: {
            stage_order: index + 1
          }
        })
      )
    );
  }

  async addStage(gameLevelId: string, stage: StageRequest) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.prisma.stage.count({
        where: {
          game_level_id: gameLevelId
        }
      });
      const stageCreated = await tx.stage.create({
        data: {
          stage_name: stage.stageName,
          game_level_id: gameLevelId,
          stage_order: order + 1
        }
      });
      await tx.stage_word.createMany({
        data: stage.wordPosIds.map((id) => ({
          word_pos_id: id,
          stage_id: stageCreated.stage_id
        }))
      });
    });
  }

  async updateStage(stageId: string, stage: StageRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.stage_word.deleteMany({
        where: {
          stage_id: stageId
        }
      });
      await tx.stage.update({
        where: {
          stage_id: stageId
        },
        data: {
          stage_name: stage.stageName
        }
      });
      await tx.stage_word.createMany({
        data: stage.wordPosIds.map((id) => ({
          word_pos_id: id,
          stage_id: stageId
        }))
      });
    });
  }
  async deleteStage(stageId: string) {
    return this.prisma.stage.delete({
      where: {
        stage_id: stageId
      }
    });
  }
}
