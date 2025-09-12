import { Inject, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from 'src/prisma/prisma.service';
import axios from 'axios';
import { Translator } from '@translated/lara';

interface CsvRow {
  headword?: string;
  pos?: string;
  CEFR?: string;
  phonetic?: string;
  meaning_vi?: string;
}

@Injectable()
export class VocabularyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('LARA_TRANSLATOR') private readonly laraTranslator: Translator
  ) {}

  async fetchDictData(
    word: string
  ): Promise<{ phonetic: string; audio: string }> {
    try {
      const res = await axios.get<
        { phonetic?: string; phonetics?: { text?: string; audio?: string }[] }[]
      >(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      );

      if (res.status === 200 && Array.isArray(res.data)) {
        const data = res.data[0];
        let phonetic = '';
        let audio = '';
        phonetic = data.phonetic ?? '';
        if (Array.isArray(data.phonetics) && data.phonetics.length > 0) {
          for (const p of data.phonetics) {
            if (p.audio) {
              audio = p.audio;
            }
          }
        }

        return { phonetic, audio };
      }
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`Dictionary API error: ${word}`, err?.message);
    }

    return { phonetic: '', audio: '' };
  }

  async translateToVi(word: string): Promise<string> {
    try {
      const result = await this.laraTranslator.translate(word, 'en', 'vi');
      return result?.translation ?? '';
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`MyMemory API error: ${word}`, err?.message);
    }
    return '';
  }

  async importCsv(file: Express.Multer.File) {
    const startTime = Date.now();
    const text = file.buffer.toString('utf-8');
    const rows: CsvRow[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ';'
    });

    const [levelsDb, tagsDb, wordsDb] = await Promise.all([
      this.prisma.levels.findMany(),
      this.prisma.pos_tags.findMany(),
      this.prisma.words.findMany()
    ]);

    const levelMap = new Map(levelsDb.map((l) => [l.level_name, l.level_id]));
    const tagMap = new Map(tagsDb.map((t) => [t.pos_tag, t.pos_tag_id]));
    const wordMap = new Map(wordsDb.map((w) => [w.word, w.word_id]));

    for (const row of rows) {
      const headword = row.headword?.trim();
      if (!headword) continue;

      let wordId = wordMap.get(headword);
      if (wordId) {
        console.log(`⚠️ Bỏ qua từ đã có: ${headword}`);
        continue;
      }

      const pos = row.pos?.trim();
      const levelName = row.CEFR?.trim();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const dictData = await this.fetchDictData(headword);
      const phonetic = dictData.phonetic;
      const audio = dictData.audio;
      if (!phonetic || !audio) {
        console.log(`❌ Bỏ qua từ: ${headword} - Thiếu phonetic hoặc audio`);
        continue;
      }

      const meaning = await this.translateToVi(headword);
      if (
        !meaning ||
        meaning.toLowerCase() === headword.toLowerCase() ||
        meaning.length <= 1
      ) {
        console.log(`❌ Bỏ qua từ: ${headword}`);
        continue;
      }

      let levelId = levelName ? levelMap.get(levelName) : null;
      if (levelName && !levelId) {
        const lvl = await this.prisma.levels.create({
          data: { level_name: levelName }
        });
        levelId = lvl.level_id;
        levelMap.set(levelName, levelId);
      }

      let tagId = pos ? tagMap.get(pos) : null;
      if (pos && !tagId) {
        const tg = await this.prisma.pos_tags.create({
          data: { pos_tag: pos }
        });
        tagId = tg.pos_tag_id;
        tagMap.set(pos, tagId);
      }
      if (!wordId) {
        const wd = await this.prisma.words.create({
          data: {
            word: headword,
            phonetic: phonetic,
            meaning_vi: meaning || null,
            level_id: levelId ?? null,
            audio: audio || null
          }
        });
        wordId = wd.word_id;
        wordMap.set(headword, wordId);
        console.log({
          word: headword,
          phonetic: phonetic || null,
          meaning_vi: meaning || null,
          level_id: levelId ?? null,
          audio: audio || null
        });
      }

      if (tagId && wordId) {
        const exists = await this.prisma.word_pos.findFirst({
          where: { word_id: wordId, pos_tag_id: tagId }
        });
        if (!exists) {
          await this.prisma.word_pos.create({
            data: { word_id: wordId, pos_tag_id: tagId }
          });
        }
      }
      const endTime = Date.now();
      const totalMs = endTime - startTime;
      const totalSec = Math.floor(totalMs / 1000);
      const minutes = Math.floor(totalSec / 60);
      const seconds = totalSec % 60;
      console.log(
        `⏱ Tổng thời gian chạy import: ${minutes} phút ${seconds} giây (${totalSec} giây)`
      );
    }

    return { message: '✅ Import thành công', total: rows.length };
  }
}
