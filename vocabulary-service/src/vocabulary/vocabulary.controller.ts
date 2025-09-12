import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VocabularyService } from './vocabulary.service';

@Controller('')
export class VocabularyController {
  constructor(private readonly service: VocabularyService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File) {
    return this.service.importCsv(file);
  }
}
