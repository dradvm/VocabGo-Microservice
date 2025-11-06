import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
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

  @Get('user')
  getUserCurrentGameLevelProgress(@Req() req: PayloadToken) {
    return this.progressService.getUserCurrentGameLevelProgress(req.sub);
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
}
