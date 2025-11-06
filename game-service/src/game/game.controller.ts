import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { GameService } from './game.service';
import { GrpcMethod } from '@nestjs/microservices';
import { GetNextLessonRequest, GetStartedStageRequest } from 'src/dto/game.dto';
import { GameLevelRequest, StageRequest } from 'types/game';

@Controller('')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @GrpcMethod('GameService', 'GetStartedStage')
  async getStartedStage(data: GetStartedStageRequest) {
    return this.gameService.getStartedStage(data.gameLevleId);
  }

  @Get('gameLevels')
  async getGameLevels() {
    return this.gameService.getGameLevels();
  }

  @Post('gameLevels')
  async addGameLevel(@Body() body: GameLevelRequest) {
    return this.gameService.addGameLevel(body);
  }

  @Patch('gameLevels/order')
  async updateLevelOrder(@Body() body: { gameLevelIds: string[] }) {
    return this.gameService.updateGameLevelOrder(body.gameLevelIds);
  }
  @Patch('gameLevels/:gameLevelId')
  async updateGameLevel(
    @Body() body: GameLevelRequest,
    @Param('gameLevelId') gameLevelId: string
  ) {
    return this.gameService.updateGameLevel(gameLevelId, body);
  }

  @Delete('gameLevels/:gameLevelId')
  async deleteGameLevel(@Param('gameLevelId') gameLevelId: string) {
    return this.gameService.deleteGameLevel(gameLevelId);
  }

  @Get('gameLevels/:gameLevelId/stages')
  async getStages(@Param('gameLevelId') gameLevelId: string) {
    return this.gameService.getGameLevelStages(gameLevelId);
  }

  @Patch('gameLevels/:gameLevelId/stages/order')
  async updateStageOrder(
    @Param('gameLevelId') gameLevelId: string,
    @Body() body: { stageIds: string[] }
  ) {
    return this.gameService.updateStageOrder(gameLevelId, body.stageIds);
  }
  @Post('gameLevels/:gameLevelId/stages')
  async addStage(
    @Param('gameLevelId') gameLevelId: string,
    @Body() body: StageRequest
  ) {
    return this.gameService.addStage(gameLevelId, body);
  }
  @Patch('gameLevels/:gameLevelId/stages/:stageId')
  async updateStage(
    @Param('stageId') stageId: string,
    @Body() body: StageRequest
  ) {
    return this.gameService.updateStage(stageId, body);
  }

  @Delete('gameLevels/:gameLevelId/stages/:stageId')
  async deleteStage(@Param('stageId') stageId: string) {
    return this.gameService.deleteStage(stageId);
  }
  @Get('gameLevels/stages')
  @GrpcMethod('GameService', 'GetGameLevelsWithStages')
  async getGameLevelsWithStages() {
    return this.gameService.getGameLevelsWithStages();
  }

  @Get('lessons/:lessonId/nextLesson')
  @GrpcMethod('GameService', 'GetNextLesson')
  async getNextLesson(data: GetNextLessonRequest) {
    return this.gameService.getNextLesson(data.lessonId);
  }
}
