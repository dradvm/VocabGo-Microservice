import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc, ClientProxy } from '@nestjs/microservices';
import { user_stage_progress } from '@prisma/client';
import { firstValueFrom, Observable } from 'rxjs';
import {
  GetGameLevelsWithStages,
  GetNextLessonRequest,
  GetNextLessonResponse,
  GetStartedStageRequest,
  GetStartedStageResponse
} from 'src/dto/game.dto';
import {
  DoneLessonRequest,
  InitApplicationStageProgressRequest
} from 'src/dto/progress.dto';
import { PrismaService } from 'src/prisma/prisma.service';

interface GameService {
  getStartedStage(
    data: GetStartedStageRequest
  ): Observable<GetStartedStageResponse>;
  getGameLevelsWithStages(data: any): Observable<GetGameLevelsWithStages>;
  getNextLesson(data: GetNextLessonRequest): Observable<GetNextLessonResponse>;
}
interface UserService {
  CheckEnergy(data: { userId: string }): Observable<{ hasEnergy: boolean }>;
}

@Injectable()
export class ProgressService implements OnModuleInit {
  private gameService: GameService;
  private userService: UserService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('GAME_GRPC_SERVICE') private readonly gameClientGrpc: ClientGrpc,
    @Inject('USER_GRPC_SERVICE') private readonly userClientGrpc: ClientGrpc,
    @Inject('USER_PUBLISHER') private readonly userClient: ClientProxy
  ) {}

  onModuleInit() {
    this.gameService =
      this.gameClientGrpc.getService<GameService>('GameService');
    this.userService =
      this.userClientGrpc.getService<UserService>('UserService');
  }

  async createUserLessonProgress(
    userStageProgressId: string,
    lessonId: string
  ) {
    await this.prisma.user_lesson_progress.create({
      data: {
        lesson_id: lessonId,
        user_stage_progress_id: userStageProgressId
      }
    });
  }

  async createUserStageProgress(userId: string, stageId: string) {
    return await this.prisma.user_stage_progress.create({
      data: {
        user_id: userId,
        stage_id: stageId
      }
    });
  }

  async initApplicationStageProgress(req: InitApplicationStageProgressRequest) {
    const data: GetStartedStageResponse = await firstValueFrom(
      this.gameService.getStartedStage({ gameLevelId: null })
    );
    await this.prisma.user_stage_progress.deleteMany({
      where: {
        user_id: req.userId
      }
    });
    const userStageProgress = await this.createUserStageProgress(
      req.userId,
      data.stageId
    );
    await this.createUserLessonProgress(
      userStageProgress.user_stage_progress_id,
      data.lessonId
    );
  }
  async getUserCurrentGameLevelProgress(userId: string) {
    const data: GetGameLevelsWithStages = await firstValueFrom(
      this.gameService.getGameLevelsWithStages({})
    );

    let stageProgress = await this.prisma.user_stage_progress.findFirst({
      where: { user_id: userId, is_done: false }
    });
    const countStageProgress = await this.prisma.user_stage_progress.count({
      where: { user_id: userId }
    });
    if (!countStageProgress) {
      await this.initApplicationStageProgress({ userId: userId });
      stageProgress = await this.prisma.user_stage_progress.findFirst({
        where: { user_id: userId, is_done: false }
      });
    }
    let gameLevel = data.gameLevels.find((level) =>
      level.stage.some((stage) => stage.stageId === stageProgress?.stage_id)
    );

    if (!gameLevel) {
      gameLevel = data.gameLevels[data.gameLevels.length - 1];
    }
    const lastLessonProgress = await this.prisma.user_lesson_progress.findFirst(
      {
        where: {
          user_stage_progress: {
            user_id: userId
          }
        },
        orderBy: {
          completed_at: 'desc'
        },
        include: {
          user_stage_progress: true
        }
      }
    );
    if (lastLessonProgress?.user_stage_progress.is_done) {
      const nextLesson = await firstValueFrom(
        this.gameService.getNextLesson({
          lessonId: lastLessonProgress.lesson_id
        })
      );
      if (
        lastLessonProgress.user_stage_progress_id != nextLesson.stageId &&
        nextLesson.lessonId
      ) {
        await this.prisma.user_stage_progress.create({
          data: {
            user_id: userId,
            stage_id: nextLesson.stageId,
            user_lesson_progress: {
              create: {
                lesson_id: nextLesson.lessonId
              }
            }
          }
        });
      }
    }
    return { gameLevelId: gameLevel?.gameLevelId || null };
  }

  async getGameLevelsProgress(userId: string) {
    const data: GetGameLevelsWithStages = await firstValueFrom(
      this.gameService.getGameLevelsWithStages({})
    );
    const userStage = await this.prisma.user_stage_progress.findMany({
      where: {
        user_id: userId
      }
    });
    const result = data.gameLevels.map((gameLevel) => {
      const gameLevelStage = gameLevel.stage.flatMap((stage) => stage.stageId);
      const stageProgress = userStage
        .filter((stage) => gameLevelStage.includes(stage.stage_id))
        .reduce((total, stage) => total + (stage.is_done ? 1 : 0), 0);
      const isStarted =
        userStage.filter((stage) => gameLevelStage.includes(stage.stage_id))
          .length > 0;
      return {
        gameLevelId: gameLevel.gameLevelId,
        stageProgress: stageProgress,
        totalStage: gameLevel.stage.length,
        isStarted: isStarted
      };
    });
    return result;
  }
  async getGameStagesProgress(stageIds: string[], userId: string) {
    const stagesProgress = this.prisma.user_stage_progress.findMany({
      where: {
        user_id: userId
      },
      include: {
        user_lesson_progress: true
      }
    });
    return stagesProgress;
  }
  async doneLesson(data: DoneLessonRequest, userId: string) {
    try {
      let isStreakCreated = false;
      await this.prisma.$transaction(async (tx) => {
        const progress = await tx.user_lesson_progress.findUnique({
          where: { user_lesson_progress_id: data.userLessonProgressId },
          include: { user_stage_progress: true }
        });

        // Emit sự kiện hoàn thành bài học
        if (data.isGame) {
          this.userClient.emit('lesson_progress_done', {
            userId,
            kp: data.kp
          });
        } else {
          this.userClient.emit('lesson_progress_done', {
            userId,
            reward: data.kp
          });
        }
        if (data.isGame) {
          isStreakCreated = await this.handleUserStreakAction(userId);
        } else {
          isStreakCreated = false;
        }

        if (!progress) return;

        // Cập nhật tiến trình bài học hiện tại
        await tx.user_lesson_progress.update({
          where: { user_lesson_progress_id: data.userLessonProgressId },
          data: {
            completed_at: new Date(),
            time_spent: data.timeSpent,
            accuracy_rate: data.accuracyRate
          }
        });

        let stageProgress: user_stage_progress | null =
          progress.user_stage_progress;

        // Lấy bài học tiếp theo
        const nextLesson = await firstValueFrom(
          this.gameService.getNextLesson({ lessonId: progress.lesson_id })
        );
        // Nếu sang stage mới, cập nhật và tạo stage progress mới
        if (stageProgress.stage_id !== nextLesson.stageId) {
          await tx.user_stage_progress.update({
            where: {
              user_stage_progress_id: progress.user_stage_progress_id
            },
            data: { is_done: true }
          });
          if (nextLesson.stageId != '') {
            const newStage = await tx.user_stage_progress.create({
              data: { stage_id: nextLesson.stageId, user_id: userId }
            });
            stageProgress = newStage;
          } else {
            return;
          }
        }
        const existingProgress = await tx.user_lesson_progress.findFirst({
          where: {
            user_stage_progress_id: stageProgress.user_stage_progress_id,
            lesson_id: nextLesson.lessonId
          }
        });

        if (!existingProgress) {
          await tx.user_lesson_progress.create({
            data: {
              user_stage_progress_id: stageProgress.user_stage_progress_id,
              lesson_id: nextLesson.lessonId
            }
          });
        }
      });
      return { isStreakCreated };
    } catch (err) {
      console.error(err);
    }
  }

  async startLesson(userId: string) {
    const data = await firstValueFrom(this.userService.CheckEnergy({ userId }));

    if (!data.hasEnergy) {
      return {
        hasEnergy: false
      };
    } else {
      await firstValueFrom(
        this.userClient.emit('lesson_progress_started', {
          userId
        })
      );
      return {
        hasEnergy: true
      };
    }
  }
  async handleUserStreakAction(userId: string): Promise<boolean> {
    const today = new Date(
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    );
    let streak = await this.prisma.streak.findFirst({
      where: { user_id: userId }
    });

    // Nếu chưa có streak -> khởi tạo
    if (!streak) {
      streak = await this.prisma.streak.create({
        data: {
          user_id: userId,
          current_streak: 1,
          longest_streak: 1,
          start_date: today,
          last_active_at: today,
          freeze_available: 0
        }
      });
      await this.prisma.streak_day.create({
        data: {
          streak_id: streak.streak_id,
          user_id: userId,
          activity_date: today
        }
      });
      return true;
    }

    const lastActive = new Date(streak.last_active_at ?? new Date());
    lastActive.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) {
      return false;
    }

    if (diffDays === 1) {
      streak.current_streak += 1;
    } else {
      streak.current_streak = 1;
      streak.start_date = today;
    }

    // Cập nhật longest
    if (streak.current_streak > streak.longest_streak) {
      streak.longest_streak = streak.current_streak;
    }

    streak.last_active_at = today;

    await this.prisma.streak.update({
      where: { streak_id: streak.streak_id },
      data: streak
    });
    await this.prisma.streak_day.create({
      data: {
        streak_id: streak.streak_id,
        user_id: userId,
        activity_date: today,
        is_frozen: false
      }
    });
    return true;
  }

  async getUserStreakInfo(userId: string) {
    // Lấy ngày hôm nay và 6 ngày trước theo VN
    const today = new Date(
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    );
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    // Lấy streak hiện tại
    const streak = await this.prisma.streak.findFirst({
      where: { user_id: userId }
    });

    // Lấy các ngày streak hoặc streak frozen trong 7 ngày gần nhất
    const streakDays = await this.prisma.streak_day.findMany({
      where: {
        user_id: userId,
        activity_date: {
          gte: sevenDaysAgo,
          lte: today
        }
      },
      select: {
        activity_date: true,
        is_frozen: true
      },
      orderBy: {
        activity_date: 'asc'
      }
    });

    // Map lại mảng kết quả: CN -> T7
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const days = streakDays.map((d) => ({
      day: dayNames[
        new Date(d.activity_date).toLocaleString('en-US', {
          timeZone: 'Asia/Ho_Chi_Minh',
          weekday: 'short'
        }) === 'Sun'
          ? 0
          : new Date(d.activity_date).getDay()
      ],
      isFrozen: d.is_frozen
    }));

    return {
      currentStreak: streak?.current_streak ?? 0,
      freezeAvailable: streak?.freeze_available ?? 0,
      days
    };
  }

  async getUserMonthlyStreak(userId: string, month: number, year: number) {
    // Ngày đầu và cuối tháng theo VN
    const startOfMonth = new Date(
      new Date(
        `${year}-${month.toString().padStart(2, '0')}-01`
      ).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    );
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(startOfMonth.getMonth() + 1);
    endOfMonth.setDate(0); // ngày cuối cùng của tháng

    // Truy vấn dữ liệu streak_day trong khoảng tháng đó
    const streakDays = await this.prisma.streak_day.findMany({
      where: {
        user_id: userId,
        activity_date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      select: {
        activity_date: true,
        is_frozen: true
      },
      orderBy: {
        activity_date: 'asc'
      }
    });

    // Trả về danh sách gọn
    return streakDays.map((day) => ({
      date: day.activity_date,
      isFrozen: day.is_frozen
    }));
  }

  async getUserStreakPreview(userId: string) {
    const today = new Date(
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    );

    const streak = await this.prisma.streak.findFirst({
      where: { user_id: userId },
      select: {
        streak_id: true,
        current_streak: true,
        longest_streak: true,
        freeze_available: true,
        last_active_at: true,
        start_date: true
      }
    });

    if (!streak) {
      return { currentStreak: 0, usedFreezeYesterday: false };
    }

    const lastActive = new Date(streak.last_active_at ?? '');
    const diffDays = Math.floor(
      (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
    );

    let usedFreezeYesterday = false;

    if (
      diffDays >= 2 &&
      streak.freeze_available > 0 &&
      diffDays - 1 <= streak.freeze_available
    ) {
      await this.prisma.streak.update({
        where: { streak_id: streak.streak_id },
        data: {
          freeze_available: streak.freeze_available - diffDays + 1,
          last_active_at: new Date(
            lastActive.getTime() + 24 * 60 * 60 * 1000 * (diffDays - 1)
          )
        }
      });
      usedFreezeYesterday = true;
      for (let i = 1; i < diffDays; i++) {
        await this.prisma.streak_day.create({
          data: {
            streak_id: streak.streak_id,
            user_id: userId,
            activity_date: new Date(
              lastActive.getTime() + 24 * 60 * 60 * 1000 * i
            ),
            is_frozen: true
          }
        });
      }
    } else if (diffDays > 2) {
      await this.prisma.streak.update({
        where: { streak_id: streak.streak_id },
        data: { current_streak: 0 }
      });
      return { currentStreak: 0, usedFreezeYesterday: false };
    }
    // Còn lại (diffDays 0 hoặc 1) => không thay đổi
    return {
      currentStreak: streak.current_streak,
      usedFreezeYesterday
    };
  }

  async recoverFreeze(userId: string) {
    const streak = await this.prisma.streak.findFirst({
      where: { user_id: userId }
    });
    if (!streak) return null;

    const newFreeze = (streak.freeze_available ?? 0) + 2;
    this.userClient.emit('streak_freeze_recovered', { userId });
    return this.prisma.streak.update({
      where: { streak_id: streak.streak_id },
      data: { freeze_available: newFreeze }
    });
  }
  async deleteUserStageProgress(stageId: string) {
    return this.prisma.user_stage_progress.deleteMany({
      where: {
        stage_id: stageId
      }
    });
  }
  async deleteUserLessonProgress(lessonId: string) {
    return this.prisma.user_lesson_progress.deleteMany({
      where: {
        lesson_id: lessonId
      }
    });
  }

  async getActivityOverview() {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);

    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    const activeUsers = await this.prisma.streak_day.count({
      where: {
        is_frozen: false,
        activity_date: {
          gte: start,
          lte: end
        }
      }
    });
    return activeUsers;
  }

  async getActivityStatsByPeriod(period: string) {
    const now = new Date();
    const counts: number[] = [];

    if (period === 'day') {
      const counts: number[] = [];
      const now = new Date();

      for (let i = 6; i >= 0; i--) {
        const day = new Date(now);
        day.setDate(now.getDate() - i);

        const nextDay = new Date(day);
        nextDay.setDate(day.getDate() + 1);

        const count = await this.prisma.streak_day.count({
          where: {
            is_frozen: false,
            activity_date: {
              gte: day,
              lt: nextDay // < ngày tiếp theo
            }
          }
        });
        counts.push(count);
      }

      return counts;
    } else if (period === 'month') {
      // 12 tháng trong năm hiện tại
      const year = now.getFullYear();

      for (let m = 0; m < 12; m++) {
        const startMonth = new Date(year, m, 1);
        const endMonth = new Date(year, m + 1, 1);

        const grouped = await this.prisma.streak_day.groupBy({
          by: ['user_id'],
          where: {
            is_frozen: false,
            activity_date: { gte: startMonth, lt: endMonth }
          }
        });

        counts.push(grouped.length); // số user khác nhau trong tháng
      }
    } else if (period === 'year') {
      const startYear = now.getFullYear() - 4;

      for (let y = startYear; y <= now.getFullYear(); y++) {
        const start = new Date(y, 0, 1);
        const end = new Date(y + 1, 0, 1);

        const grouped = await this.prisma.streak_day.groupBy({
          by: ['user_id'],
          where: {
            is_frozen: false,
            activity_date: {
              gte: start,
              lt: end
            }
          }
        });

        counts.push(grouped.length);
      }
    }

    return counts;
  }
}
