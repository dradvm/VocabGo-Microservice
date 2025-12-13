import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { QuestService } from './quest.service';
import { PayloadToken } from 'types/payloadToken';

@Controller('')
export class QuestController {
  constructor(private readonly questService: QuestService) {}

  @Get('/monthly-quests')
  async getMonthlyQuests(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.questService.getUserMonthlyQuests(payloadToken.sub);
  }

  @Get('/daily-quests')
  async getDailyQuests(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.questService.getUserDailyQuests(payloadToken.sub);
  }

  @Post('done/flashcard')
  async doneFlashcardQuests(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.questService.doneFlashcardQuests(payloadToken.sub);
  }
  @Post('done/streak')
  async doneStreakQuests(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.questService.doneStreakQuests(payloadToken.sub);
  }
  @Post('done/game/:questionId')
  async doneGameQuests(
    @Param('questionId') questionId: string,
    @Req() req: Request
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );

    return this.questService.doneGameQuests(payloadToken.sub, questionId);
  }
  @Post('done/time')
  async doneTimeQuests(@Body('time') time: number, @Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.questService.doneTimeQuests(payloadToken.sub, time);
  }

  @Post('claim-reward/:questInstanceId')
  async claimRequestReward(
    @Param('questInstanceId') questInstanceId: string,
    @Req() req: Request
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.questService.claimQuestReward(
      payloadToken.sub,
      questInstanceId
    );
  }

  @Post('claim-milestone-reward')
  async claimMilestoneReward(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.questService.claimMilestoneReward(payloadToken.sub);
  }

  @Get('dashboard/overview')
  async getQuestOverview() {
    return this.questService.getQuestOverview();
  }

  @Get('dashboard/stats')
  async getQuestStatsByPeriod(@Query('period') period: string) {
    return this.questService.getQuestStatsByPeriod(period);
  }
}
