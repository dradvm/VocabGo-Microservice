import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { game_level } from '@prisma/client';
import { GetStartedStageResponse } from 'src/dto/game.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { GameLevelRequest, LessonRequest, StageRequest } from 'types/game';
@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('PROGRESS_PUBLISHER') private readonly progressClient: ClientProxy
  ) {}

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
  async getAllGameLevelStages(levelId: string) {
    return this.prisma.stage.findMany({
      where: {
        game_level_id: levelId
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
      },
      orderBy: {
        level_order: 'asc'
      }
    });
    return {
      gameLevels: gameLevels
        .filter((gameLevel) => gameLevel.stage.length > 0)
        .map((gameLevel) => {
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
      orderBy: {
        stage_order: 'asc'
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
    const nextGameLevel = await this.prisma.game_level.findFirst({
      where: { level_order: { gt: game_level.level_order } },
      orderBy: { level_order: 'asc' }
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
    const flashcardLessonType = await this.prisma.lesson_type.findFirst({
      where: {
        lesson_type_name: 'Flashcard'
      }
    });
    const rewardLessonType = await this.prisma.lesson_type.findFirst({
      where: {
        lesson_type_name: 'Reward'
      }
    });

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
          stage_order: order + 1,
          lesson: {
            create: [
              {
                lesson_name: 'Học Flashcard',
                lesson_type_id: flashcardLessonType?.lesson_type_id ?? '',
                lesson_order: 1,
                lesson_reward: 5
              },
              {
                lesson_name: 'Nhận thưởng',
                lesson_type_id: rewardLessonType?.lesson_type_id ?? '',
                lesson_order: 2,
                lesson_reward: 100
              }
            ]
          }
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
    const stage = await this.prisma.stage.delete({
      where: {
        stage_id: stageId
      }
    });
    this.progressClient.emit('stage_deleted', { stageId: stage.stage_id });
  }

  async updateStageActive(stageId: string, isActive: boolean) {
    return this.prisma.stage.update({
      where: {
        stage_id: stageId
      },
      data: {
        is_active: isActive
      }
    });
  }

  async getAllLessons(stageId: string) {
    return this.prisma.lesson.findMany({
      where: { stage_id: stageId },
      orderBy: { lesson_order: 'asc' },
      include: {
        lesson_type: true,
        lesson_question: {
          include: {
            question: true
          }
        }
      }
    });
  }
  async getLessonTypes() {
    return this.prisma.lesson_type.findMany();
  }
  async addLesson(stageId: string, lesson: LessonRequest) {
    const count = await this.prisma.lesson.count({
      where: {
        stage_id: stageId
      }
    });
    await this.prisma.lesson.updateMany({
      where: {
        stage_id: stageId,
        lesson_order: count
      },
      data: {
        lesson_order: count + 1
      }
    });
    return this.prisma.lesson.create({
      data: {
        lesson_name: lesson.lessonName,
        lesson_order: count,
        lesson_reward: lesson.lessonReward,
        lesson_type_id: lesson.lessonTypeId,
        stage_id: stageId,
        lesson_question: {
          create: lesson.questions.map((question) => ({
            question_id: question.questionId,
            question_count: question.questionCount
          }))
        }
      }
    });
  }

  async updateLesson(lessonId: string, lesson: LessonRequest) {
    await this.prisma.lesson_question.deleteMany({
      where: {
        lesson_id: lessonId
      }
    });
    return this.prisma.lesson.update({
      where: {
        lesson_id: lessonId
      },
      data: {
        lesson_name: lesson.lessonName,
        lesson_reward: lesson.lessonReward,
        lesson_type_id: lesson.lessonTypeId,
        lesson_question: {
          create: lesson.questions.map((question) => ({
            question_id: question.questionId,
            question_count: question.questionCount
          }))
        }
      }
    });
  }

  async deleteLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.delete({
      where: { lesson_id: lessonId }
    });
    this.progressClient.emit('lesson_deleted', { lessonId: lesson.lesson_id });
    return lesson;
  }

  async updateLessonOrder(stageId: string, ids: string[]) {
    const updates = ids.map((id, index) =>
      this.prisma.lesson.update({
        where: {
          stage_id: stageId,
          lesson_id: id
        },
        data: { lesson_order: index + 1 }
      })
    );
    return this.prisma.$transaction(updates);
  }
  async getAllQuestions() {
    return this.prisma.question.findMany({});
  }
}
