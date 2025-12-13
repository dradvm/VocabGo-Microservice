import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ProgressService } from './progress.service';
import {
  DoneLessonRequest,
  InitApplicationStageProgressRequest
} from 'src/dto/progress.dto';
import { EventPattern } from '@nestjs/microservices';
import { PayloadToken } from 'types/payloadToken';
@Controller('')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @EventPattern('user_created')
  initApplicationStageProgress(data: InitApplicationStageProgressRequest) {
    return this.progressService.initApplicationStageProgress(data);
  }

  @EventPattern('stage_deleted')
  deleteUserStageProgress(data: { stageId: string }) {
    return this.progressService.deleteUserStageProgress(data.stageId);
  }

  @EventPattern('lesson_deleted')
  deleteUserLessonProgress(data: { lessonId: string }) {
    return this.progressService.deleteUserLessonProgress(data.lessonId);
  }

  @Get('user')
  getUserCurrentGameLevelProgress(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.getUserCurrentGameLevelProgress(
      payloadToken.sub
    );
  }
  @Get('gameLevels')
  async getGameLevelsProgress(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.getGameLevelsProgress(payloadToken.sub);
  }
  @Post('gameStages')
  async getGameStagesProgress(
    @Body('stageIds') stageIds: string[],
    @Req() req: Request
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.getGameStagesProgress(
      stageIds,
      payloadToken.sub
    );
  }

  @Post('lesson/start')
  async startLesson(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.startLesson(payloadToken.sub);
  }

  @Post('lesson/done')
  async doneLesson(@Body() data: DoneLessonRequest, @Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.doneLesson(data, payloadToken.sub);
  }

  @Get('streak')
  async getUserStreak(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.getUserStreakInfo(payloadToken.sub);
  }

  @Get('streak/userId/:userId')
  async getUserStreakById(@Param('userId') userId: string) {
    return this.progressService.getUserStreakInfo(userId);
  }

  @Post('streak/freeze')
  async recoverFreeze(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.recoverFreeze(payloadToken.sub);
  }
  @Get('streak/preview')
  async getUserStreakPreview(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.getUserStreakPreview(payloadToken.sub);
  }
  @Get('streak/month')
  async getUserMonthlyStreak(
    @Query('month') month: number,
    @Query('year') year: number,
    @Req() req: Request
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.progressService.getUserMonthlyStreak(
      payloadToken.sub,
      month,
      year
    );
  }

  @Get('dashboard/overview')
  async getActivityOverview() {
    return this.progressService.getActivityOverview();
  }

  @Get('dashboard/stats')
  async getActivityStatsByPeriod(@Query('period') period: string) {
    return this.progressService.getActivityStatsByPeriod(period);
  }
}
