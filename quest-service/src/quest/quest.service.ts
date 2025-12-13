import { difficulty_level } from './../../node_modules/.prisma/client/index.d';
import { ClientProxy } from '@nestjs/microservices';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { quest_instance } from '@prisma/client';

@Injectable()
export class QuestService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('USER_PUBLISHER') private readonly userClient: ClientProxy
  ) {}

  async getUserMonthlyQuests(userId: string) {
    return this.getOrCreateMonthlyQuest(userId);
  }
  async getUserDailyQuests(userId: string) {
    const monthlyQuest = await this.getUserMonthlyQuests(userId);
    return this.getOrCreateDailyQuests(monthlyQuest.monthly_quest_id);
  }

  async getOrCreateMonthlyQuest(userId: string) {
    const date = new Date();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    let monthlyQuest = await this.prisma.monthly_quest.findFirst({
      where: { user_id: userId, month, year }
    });
    if (!monthlyQuest) {
      monthlyQuest = await this.prisma.monthly_quest.create({
        data: { user_id: userId, month, year }
      });
    }
    return monthlyQuest;
  }

  async getOrCreateDailyQuests(
    monthlyQuestId: string
  ): Promise<quest_instance[]> {
    const today = this.getTodayVN();

    const existing = await this.prisma.quest_instance.findMany({
      where: { monthly_quest_id: monthlyQuestId, assigned_date: today },
      include: {
        quest_template: {
          include: {
            difficulty_level: true
          }
        }
      },
      orderBy: {
        quest_template: {
          difficulty_level: {
            level_order: 'asc'
          }
        }
      }
    });
    if (existing.length > 0) return existing;

    const levels = await this.prisma.difficulty_level.findMany();

    const quests = await Promise.all(
      levels.map((level) =>
        this.createQuestForDifficulty(
          level.difficulty_level_id,
          monthlyQuestId,
          today
        )
      )
    );
    quests.sort(
      (a, b) =>
        (a.quest_template?.difficulty_level?.level_order ?? 0) -
        (b.quest_template?.difficulty_level?.level_order ?? 0)
    );
    return quests;
  }

  async createQuestForDifficulty(
    difficultyLevelId: string,
    monthlyQuestId: string,
    assignedDate: Date
  ) {
    const templates = await this.prisma.quest_template.findMany({
      where: { difficulty_level_id: difficultyLevelId }
    });

    const template = templates[Math.floor(Math.random() * templates.length)];

    return this.prisma.quest_instance.create({
      data: {
        monthly_quest_id: monthlyQuestId,
        quest_template_id: template.quest_template_id,
        assigned_date: assignedDate
      },
      include: {
        quest_template: {
          include: {
            difficulty_level: true
          }
        }
      }
    });
  }

  private getTodayVN(): Date {
    return new Date(
      new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh'
      })
    );
  }

  async doneStreakQuests(userId: string) {
    const today = this.getTodayVN();
    const monthlyQuest = await this.getUserMonthlyQuests(userId);
    const questInstance = await this.prisma.quest_instance.findFirst({
      where: {
        monthly_quest_id: monthlyQuest.monthly_quest_id,
        quest_template: {
          quest_type: {
            quest_type_name: 'Daily Streak'
          }
        },
        assigned_date: today
      }
    });
    if (!questInstance) {
      return null;
    }
    return this.prisma.quest_instance.updateMany({
      where: {
        quest_instance_id: questInstance.quest_instance_id,
        assigned_date: today
      },
      data: {
        current_value: 1
      }
    });
  }

  async doneFlashcardQuests(userId: string) {
    const today = this.getTodayVN();
    const monthlyQuest = await this.getUserMonthlyQuests(userId);
    const questInstance = await this.prisma.quest_instance.findFirst({
      where: {
        monthly_quest_id: monthlyQuest.monthly_quest_id,
        quest_template: {
          quest_type: {
            quest_type_name: 'Flashcard'
          }
        },
        assigned_date: today
      }
    });
    if (!questInstance) {
      return null;
    }
    return this.prisma.quest_instance.updateMany({
      where: {
        quest_instance_id: questInstance.quest_instance_id,
        assigned_date: today
      },
      data: {
        current_value: 1
      }
    });
  }

  async doneTimeQuests(userId: string, time: number) {
    const today = this.getTodayVN();
    const monthlyQuest = await this.getUserMonthlyQuests(userId);
    const questInstance = await this.prisma.quest_instance.findFirst({
      where: {
        monthly_quest_id: monthlyQuest.monthly_quest_id,
        quest_template: {
          quest_type: {
            quest_type_name: 'Study Time'
          }
        },
        assigned_date: today
      },
      include: {
        quest_template: true
      }
    });
    if (!questInstance) {
      return null;
    }
    const increaseTime =
      questInstance.current_value + time <=
      (questInstance.quest_template?.target_value ?? 0)
        ? questInstance.current_value + time
        : questInstance.quest_template?.target_value;
    return this.prisma.quest_instance.updateMany({
      where: {
        quest_instance_id: questInstance.quest_instance_id,
        assigned_date: today
      },
      data: {
        current_value: increaseTime
      }
    });
  }

  async doneGameQuests(userId: string, questionId: string) {
    const today = this.getTodayVN();
    const monthlyQuest = await this.getUserMonthlyQuests(userId);
    const questInstances = (
      await this.prisma.quest_instance.findMany({
        where: {
          monthly_quest_id: monthlyQuest.monthly_quest_id,
          quest_template: {
            question_id: questionId
          },
          assigned_date: today
        },
        include: {
          quest_template: true
        }
      })
    ).filter(
      (questInstance) =>
        questInstance &&
        !questInstance.reward_claimed_at &&
        questInstance.current_value <
          (questInstance.quest_template?.target_value ?? 0)
    );

    if (questInstances.length == 0) {
      return null;
    }
    return this.prisma.quest_instance.updateMany({
      where: {
        quest_instance_id: {
          in: questInstances.map(
            (questInstance) => questInstance.quest_instance_id
          )
        },
        quest_template: {
          question_id: questionId
        },
        assigned_date: today
      },
      data: {
        current_value: {
          increment: 1
        }
      }
    });
  }

  async claimQuestReward(userId: string, questInstanceId: string) {
    const today = this.getTodayVN();
    const updated = await this.prisma.quest_instance.update({
      where: {
        quest_instance_id: questInstanceId,
        assigned_date: today
      },
      data: {
        reward_claimed_at: new Date()
      },
      include: {
        quest_template: true
      }
    });

    this.userClient.emit('quest_completed', {
      userId,
      reward: updated.quest_template?.reward_value ?? 0
    });
    await this.updateProgressMonthlyQuest(userId);
    return updated;
  }
  async updateProgressMonthlyQuest(userId: string) {
    const monthlyQuest = await this.getUserMonthlyQuests(userId);
    const dailyQuests = await this.getUserDailyQuests(userId);

    if (
      dailyQuests.every((quest) => quest.reward_claimed_at !== null) &&
      monthlyQuest.current_progress < monthlyQuest.max_point
    ) {
      const newProgress = monthlyQuest.current_progress + 1;
      await this.prisma.monthly_quest.update({
        where: {
          monthly_quest_id: monthlyQuest.monthly_quest_id
        },
        data: {
          current_progress: newProgress
        }
      });
    }
  }
  async claimMilestoneReward(userId: string) {
    const monthlyQuest = await this.getUserMonthlyQuests(userId);
    const isUpdateMilestone1 =
      monthlyQuest.current_progress >= monthlyQuest.milestone_1 &&
      !monthlyQuest.is_claimed_1;
    const isUpdateMilestone2 =
      monthlyQuest.current_progress >= monthlyQuest.milestone_2 &&
      !monthlyQuest.is_claimed_2;
    const isUpdateMilestone3 =
      monthlyQuest.current_progress >= monthlyQuest.milestone_3 &&
      !monthlyQuest.is_claimed_3;
    if (isUpdateMilestone1) {
      this.userClient.emit('quest_completed', {
        userId,
        reward: 200
      });
    }
    if (isUpdateMilestone2) {
      this.userClient.emit('quest_completed', {
        userId,
        reward: 300
      });
    }
    if (isUpdateMilestone3) {
      this.userClient.emit('quest_completed', {
        userId,
        reward: 500
      });
    }
    if (isUpdateMilestone1 || isUpdateMilestone2 || isUpdateMilestone3) {
      return this.prisma.monthly_quest.update({
        where: {
          monthly_quest_id: monthlyQuest.monthly_quest_id
        },
        data: {
          is_claimed_1: isUpdateMilestone1 || monthlyQuest.is_claimed_1,
          is_claimed_2: isUpdateMilestone2 || monthlyQuest.is_claimed_2,
          is_claimed_3: isUpdateMilestone3 || monthlyQuest.is_claimed_3
        }
      });
    }

    return null;
  }

  async getQuestOverview() {
    const today = new Date();

    // ----- Tháng hiện tại -----
    const thisMonthStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    const thisMonthEnd = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999
    );

    // ----- Tháng trước -----
    const lastMonthStart = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
      0,
      0,
      0,
      0
    );
    const lastMonthEnd = new Date(
      today.getFullYear(),
      today.getMonth(),
      0,
      23,
      59,
      59,
      999
    );

    // Lấy tất cả instance tháng hiện tại kèm template
    const thisMonthQuests = await this.prisma.quest_instance.findMany({
      where: {
        created_at: { gte: thisMonthStart, lte: thisMonthEnd }
      },
      include: {
        quest_template: true
      }
    });

    // Lấy tất cả instance tháng trước kèm template
    const lastMonthQuests = await this.prisma.quest_instance.findMany({
      where: {
        created_at: { gte: lastMonthStart, lte: lastMonthEnd }
      },
      include: {
        quest_template: true
      }
    });

    // Hàm tính tỉ lệ hoàn thành
    const calcRate = (quests: any[]) => {
      const total = quests.length;
      if (total === 0) return 0;

      const completed = quests.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (q) => q.current_value >= q.quest_template.target_value
      ).length;

      return (completed / total) * 100;
    };

    const thisMonthRate = calcRate(thisMonthQuests);
    const lastMonthRate = calcRate(lastMonthQuests);

    return {
      thisMonthRate: Number(thisMonthRate.toFixed(1)),
      lastMonthRate: Number(lastMonthRate.toFixed(1))
    };
  }

  async getQuestStatsByPeriod(period: string) {
    const now = new Date();
    const results: number[] = [];

    // Hàm tính tỉ lệ hoàn thành (%)
    const calcRate = (quests: any[]) => {
      const total = quests.length;
      if (total === 0) return 0;

      const completed = quests.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (q) => q.current_value >= q.quest_template.target_value
      ).length;

      return Number(((completed / total) * 100).toFixed(1));
    };

    if (period === 'day') {
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        dayStart.setDate(now.getDate() - i);

        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayStart.getDate() + 1);

        const quests = await this.prisma.quest_instance.findMany({
          where: {
            created_at: { gte: dayStart, lt: dayEnd }
          },
          include: { quest_template: true }
        });

        results.push(calcRate(quests));
      }

      return results;
    } else if (period === 'month') {
      const year = now.getFullYear();

      for (let month = 0; month < 12; month++) {
        const startMonth = new Date(year, month, 1, 0, 0, 0, 0);
        const endMonth = new Date(year, month + 1, 1, 0, 0, 0, 0);

        const quests = await this.prisma.quest_instance.findMany({
          where: {
            created_at: { gte: startMonth, lt: endMonth }
          },
          include: { quest_template: true }
        });

        results.push(calcRate(quests));
      }
    } else if (period === 'year') {
      const startYear = now.getFullYear() - 4;

      for (let y = startYear; y <= now.getFullYear(); y++) {
        const start = new Date(y, 0, 1, 0, 0, 0, 0);
        const end = new Date(y + 1, 0, 1, 0, 0, 0, 0);

        const quests = await this.prisma.quest_instance.findMany({
          where: {
            created_at: { gte: start, lt: end }
          },
          include: { quest_template: true }
        });

        results.push(calcRate(quests));
      }
    }

    return results;
  }
}
