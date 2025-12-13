import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Body,
  Query,
  Req,
  Param,
  Patch,
  UploadedFiles,
  Delete,
  Res
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
  FilesInterceptor
} from '@nestjs/platform-express';
import { VocabularyService } from './vocabulary.service';
import {
  WordRequest,
  WordPos,
  AudioCloudinary,
  ImageCloudinary
} from 'types/word';
import { format } from 'fast-csv';
import { Response } from 'express';
@Controller('')
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File) {
    return this.vocabularyService.importCsv(file);
  }

  @Get('levels')
  async getLevels() {
    return this.vocabularyService.getLevels();
  }

  @Get('posTags')
  async getPosTags() {
    return this.vocabularyService.getPosTags();
  }

  @Get('categories')
  async getCategories() {
    return this.vocabularyService.getCategories();
  }

  @Post('wordsPosIds')
  async getWordsByWordPosIds(@Body('wordPosIds') wordPosIds: string[]) {
    return this.vocabularyService.getWordsByWordPosIds(wordPosIds);
  }

  @Post('words/search')
  async getWords(
    @Body('page') page = 1,
    @Body('limit') limit = 10,
    @Body('search') search = '',
    @Body('categories') categories = []
  ) {
    return this.vocabularyService.getWords(
      Number(page),
      Number(limit),
      search,
      categories
    );
  }

  @Get('words/:wordId')
  async getWordById(@Param('wordId') wordId: string) {
    console.log('A');
    return this.vocabularyService.getWordById(wordId);
  }
  @Get('words/word/:word')
  async getWord(@Param('word') word: string) {
    console.log('B');
    return this.vocabularyService.getWord(word);
  }
  @Get('words/isExist/:word')
  async isWordExist(@Param('word') word: string) {
    return this.vocabularyService.isWordExist(word);
  }

  @Post('words')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'audio', maxCount: 1 },
      { name: 'word_pos_images' }
    ])
  )
  async createWord(
    @Body() body: WordRequest,
    @Req() req,
    @UploadedFiles() files: { [key: string]: Express.Multer.File[] }
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const token = req.headers.authorization?.replace('Bearer ', '');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const uploadAudioRes: AudioCloudinary =
      await this.vocabularyService.saveAudio(files['audio'][0], token);
    let uploadImageRes: ImageCloudinary[] = [];
    if (files['word_pos_images']) {
      uploadImageRes = await this.vocabularyService.saveImages(
        files['word_pos_images'],
        token
      );
    }
    return this.vocabularyService.addWord(body, uploadAudioRes, uploadImageRes);
  }

  @Patch('words/:wordId')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'audio', maxCount: 1 },
      { name: 'word_pos_images' }
    ])
  )
  async updateWord(
    @Param('wordId') wordId: string,
    @Body() body: WordRequest,
    @Req() req,
    @UploadedFiles() files: { [key: string]: Express.Multer.File[] }
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const token = req.headers.authorization?.replace('Bearer ', '');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let uploadAudioRes: AudioCloudinary | null = null;

    if (files['audio']) {
      uploadAudioRes = await this.vocabularyService.saveAudio(
        files['audio'][0],
        token
      );
    }
    let uploadImageRes: ImageCloudinary[] = [];
    if (files['word_pos_images']) {
      uploadImageRes = await this.vocabularyService.saveImages(
        files['word_pos_images'],
        token
      );
    }
    return this.vocabularyService.updateWord(
      wordId,
      body,
      uploadAudioRes,
      uploadImageRes,
      token
    );
  }

  @Delete('words/:wordId')
  deleleWord(@Param('wordId') wordId: string, @Req() req) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.vocabularyService.deleteWord(wordId, token);
  }

  @Get('export-csv')
  async exportCsv(@Res() res: Response) {
    const words = await this.vocabularyService.exportCsv();

    const headers = [
      'Word',
      'Phonetic',
      'Meaning VI',
      'Definition',
      'POS Tag',
      'Level',
      'Categories',
      'Examples',
      'Image',
      'Audio'
    ];

    const rows = words.map((w) =>
      [
        w.word,
        w.phonetic,
        w.meaning_vi,
        w.definition,
        w.pos_tag,
        w.level,
        w.categories,
        w.examples,
        w.image,
        w.audio
      ]
        .map((field) => `"${(field ?? '').toString().replace(/"/g, '""')}"`) // escape dấu "
        .join(',')
    );
    const bom = '\uFEFF'; // UTF-8 BOM để Excel đọc đúng tiếng Việt
    const csv = bom + [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="vocabulary.csv"'
    );
    res.send(csv);
  }

  @Get('dashboard/overview')
  async getWordOverview() {
    return this.vocabularyService.getWordOverview();
  }
}
