import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { ClaimKPRequest, CreateUserRequest } from 'src/dto/user.dto';
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
  async claimKp(data: ClaimKPRequest) {
    return this.userService.claimKP(data);
  }
  @EventPattern('lesson_progress_started')
  async onLessonStarted(data: { userId: string }) {
    return this.userService.onLessonStarted(data.userId);
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
}
