import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserRequest, DoneRequest } from 'src/dto/user.dto';
import { EventPattern, GrpcMethod } from '@nestjs/microservices';
import { PayloadToken } from 'types/payloadToken';

@Controller('')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('users')
  @GrpcMethod('UserService', 'CreateUser')
  async createUser(data: CreateUserRequest) {
    const res = await this.userService.createUser(data);
    return {
      status: !!res
    };
  }

  @Get('wallet')
  async getUserWallet(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.userService.getWallet(payloadToken.sub);
  }

  @EventPattern('lesson_progress_done')
  async onLessonDone(data: DoneRequest) {
    return this.userService.onLessonDone(data);
  }
  @EventPattern('quest_completed')
  async onQuestDone(data: DoneRequest) {
    return this.userService.onLessonDone(data);
  }
  @EventPattern('lesson_progress_started')
  async onLessonStarted(data: { userId: string }) {
    return this.userService.onLessonStarted(data.userId);
  }
  @EventPattern('streak_freeze_recovered')
  async onStreakFreezeRecovered(data: { userId: string }) {
    return this.userService.onStreakFreezeRecovered(data.userId);
  }
  @GrpcMethod('UserService', 'CheckEnergy')
  async checkEnergy(data: { userId: string }) {
    return this.userService.checkEnergy(data.userId);
  }
  @Post('profile')
  async getProfile(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.userService.getProfile(payloadToken.sub);
  }

  @Post('profile/:userId')
  async getProfileById(@Param('userId') userId: string) {
    return this.userService.getProfile(userId);
  }

  // 1. FOLLOW
  @Post('follow')
  async follow(@Body() body: { followingId: string }, @Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    const { followingId } = body;
    return await this.userService.follow(payloadToken.sub, followingId);
  }

  @Get(':userId/followers')
  async getFollowers(@Param('userId') userId: string, @Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return await this.userService.getFollowers(userId, payloadToken.sub);
  }

  @Get(':userId/followings')
  async getFollowings(@Param('userId') userId: string, @Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return await this.userService.getFollowings(userId, payloadToken.sub);
  }

  @Get(':userId/followers/count')
  async countFollowers(@Param('userId') userId: string) {
    return await this.userService.countFollowers(userId);
  }

  @Get(':userId/followings/count')
  async countFollowings(@Param('userId') userId: string) {
    return await this.userService.countFollowings(userId);
  }

  @Get('follow')
  async getUserNotFollow(
    @Req() req: Request,
    @Query('search') search: string,
    @Query('limit', ParseIntPipe) limit: number
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.userService.getUsersNotFollowedLoadMore(
      payloadToken.sub,
      search,
      limit
    );
  }

  @Get('followers')
  async getUserFollowers(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return await this.userService.getFollowers(
      payloadToken.sub,
      payloadToken.sub
    );
  }

  @Get('followings')
  async getUserFollowings(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return await this.userService.getFollowings(
      payloadToken.sub,
      payloadToken.sub
    );
  }

  @Get('followers/count')
  async countUserFollowers(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return await this.userService.countFollowers(payloadToken.sub);
  }

  @Get('followings/count')
  async countUserFollowings(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return await this.userService.countFollowings(payloadToken.sub);
  }
  @Post('energy')
  async recoverEnergy(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payloadToken: PayloadToken = JSON.parse(
      req.headers['x-user-payload']
    );
    return this.userService.recoverEnergyByRuby(payloadToken.sub);
  }

  @Get('dashboard/overview')
  async getUserOverview() {
    return this.userService.getUserOverview();
  }

  @Get('dashboard/stats')
  async getUserStatsByPeriod(@Query('period') period: string) {
    return this.userService.getUserStatsByPeriod(period);
  }
}
