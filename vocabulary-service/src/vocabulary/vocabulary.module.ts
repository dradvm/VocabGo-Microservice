import { Module } from '@nestjs/common';
import { VocabularyController } from './vocabulary.controller';
import { VocabularyService } from './vocabulary.service';

import { Credentials, Translator } from '@translated/lara';
const LaraProvider = {
  provide: 'LARA_TRANSLATOR',
  useFactory: () => {
    const credentials = new Credentials(
      process.env.LARA_ACCESS_KEY_ID || '',
      process.env.LARA_ACCESS_KEY_SECRET || ''
    );
    return new Translator(credentials);
  }
};

@Module({
  imports: [],
  controllers: [VocabularyController],
  providers: [VocabularyService, LaraProvider]
})
export class VocabularyModule {}
