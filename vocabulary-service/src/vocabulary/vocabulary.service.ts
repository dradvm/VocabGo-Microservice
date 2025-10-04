import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from 'src/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface CsvRow {
  headword?: string;
  pos?: string;
  CEFR?: string;
  category1?: string;
  category2?: string;
  category3?: string;
}

@Injectable()
export class VocabularyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService
  ) {}

  async fetchExamples(
    word: string,
    pos: string
  ): Promise<{ definition: string; examples: string[] }> {
    try {
      const res = await firstValueFrom(
        this.http.get<
          {
            meanings?: {
              partOfSpeech?: string;
              definitions?: { definition?: string; example?: string }[];
            }[];
          }[]
        >(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
        )
      );
      let definition = '';
      let examples: string[] = [];
      if (res.status === 200 && Array.isArray(res.data)) {
        const data = res.data[0];
        const wordPos: { definition?: string; example?: string }[] =
          data.meanings?.find((meaning) => meaning.partOfSpeech === pos)
            ?.definitions ?? [];
        if (wordPos?.length > 0) {
          definition = wordPos[0].definition ?? '';
          examples = (
            data.meanings?.flatMap((meaning) =>
              meaning.definitions
                ?.filter(
                  (def) =>
                    typeof def.example === 'string' &&
                    def.example.includes(word) &&
                    !def.example.includes(';') &&
                    !def.example.includes('/') &&
                    def.example.length <= 70
                )
                .map((def) =>
                  typeof def.example === 'string'
                    ? def.example
                        .split(' ')
                        .map((item) => item.trim())
                        .join(' ')
                    : ''
                )
            ) ?? []
          ).filter((ex): ex is string => typeof ex === 'string');
        }
      }
      return { definition, examples };
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`FetchExample Dictionary API error: ${word}`, err?.message);
    }
    return { definition: '', examples: [] };
  }

  async fetchDictData(word: string): Promise<{
    phonetic: string;
    audio: string;
  }> {
    try {
      const res = await firstValueFrom(
        this.http.get<
          {
            phonetic?: string;
            phonetics?: { text?: string; audio?: string }[];
            meanings?: {
              definitions?: { definition?: string; example?: string }[];
            }[];
          }[]
        >(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
        )
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
      console.log(`FetchDictData Dictionary API error: ${word}`, err?.message);
    }

    return { phonetic: '', audio: '' };
  }

  async translateToVi(word: string): Promise<string> {
    try {
      const res = await firstValueFrom(
        this.http.post<{
          translatedText: string;
          status: boolean;
          message: string;
        }>(`http://127.0.0.1:3000/translate`, {
          text: word,
          to: 'vi'
        })
      );
      if (res.status == 200 && res.data.status) {
        return res.data.translatedText;
      }
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`API error: ${word}`, err?.message);
    }
    return '';
  }

  async importCsv(file: Express.Multer.File) {
    const text = file.buffer.toString('utf-8');
    const rows: CsvRow[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ';'
    });
    const [levelsDb, tagsDb, wordsDb, categoriesDb] = await Promise.all([
      this.prisma.levels.findMany(),
      this.prisma.pos_tags.findMany(),
      this.prisma.words.findMany(),
      this.prisma.categories.findMany()
    ]);

    const levelMap = new Map(levelsDb.map((l) => [l.level_name, l.level_id]));
    const tagMap = new Map(tagsDb.map((t) => [t.pos_tag, t.pos_tag_id]));
    const wordMap = new Map(wordsDb.map((w) => [w.word, w.word_id]));
    const categoryMap = new Map(
      categoriesDb.map((c) => [c.category_name, c.category_id])
    );
    for (const row of rows) {
      const headword = row.headword?.trim();

      const levelName = row.CEFR?.trim() ?? null;
      const pos = row.pos?.trim() ?? null;

      const [levelId, tagId, categoryId1, categoryId2, categoryId3] =
        await Promise.all([
          this.getOrCreateLevel(levelName, levelMap),
          this.getOrCreatePos(pos, tagMap),
          this.getOrCreateCategory(row.category1?.trim() ?? null, categoryMap),
          this.getOrCreateCategory(row.category2?.trim() ?? null, categoryMap),
          this.getOrCreateCategory(row.category3?.trim() ?? null, categoryMap)
        ]);
      const wordId = await this.getOrCreateWord(headword, wordMap);
      const categories = [categoryId1, categoryId2, categoryId3].filter(
        (item) => item != null
      );
      if (levelId && tagId && wordId && pos && headword) {
        const wordPosId = await this.getOrCreateWordPos(
          levelId,
          tagId,
          wordId,
          headword,
          pos
        );
        if (wordPosId) {
          categories.forEach((item) => {
            void this.getOrCreateCategoryWordPos(item, wordPosId);
          });
        }
      }
    }

    return { message: '✅ Import thành công', total: rows.length };
  }

  delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async getOrCreateWordPos(
    levelId: string,
    tagId: string,
    wordId: string,
    word: string,
    pos: string
  ) {
    const wordPosExist = await this.prisma.word_pos.findFirst({
      where: {
        word_id: wordId,
        pos_tag_id: tagId
      }
    });
    if (wordPosExist) {
      const data = await this.fetchExamples(word, pos);
      await this.delay(300);
      const examples: {
        example: string;
        example_vi: string;
        word_pos_id: string;
      }[] = [];

      for (const example of data.examples) {
        const example_vi = await this.translateToVi(example);
        await this.delay(300);
        if (
          example.length <= 70 &&
          example_vi.length <= 70 &&
          example.toLowerCase() != example_vi.toLowerCase()
        ) {
          examples.push({
            example: example,
            example_vi: example_vi,
            word_pos_id: wordPosExist.word_pos_id
          });
        }
      }
      await this.prisma.word_example.createMany({
        data: examples
      });
      return wordPosExist.word_pos_id;
    }

    const data = await this.fetchExamples(word, pos);
    await this.delay(300);
    const wordPos = await this.prisma.word_pos.create({
      data: {
        level_id: levelId,
        pos_tag_id: tagId,
        word_id: wordId,
        definition: data.definition
      }
    });

    const examples: {
      example: string;
      example_vi: string;
      word_pos_id: string;
    }[] = [];

    for (const example of data.examples) {
      const example_vi = await this.translateToVi(example);
      await this.delay(300);
      if (
        example.length <= 70 &&
        example_vi.length <= 70 &&
        example.toLowerCase() != example_vi.toLowerCase()
      ) {
        examples.push({
          example: example,
          example_vi: example_vi,
          word_pos_id: wordPos.word_pos_id
        });
      }
    }
    await this.prisma.word_example.createMany({
      data: examples
    });
    return wordPos.word_pos_id;
  }

  async getOrCreateWord(
    headword: string | undefined,
    wordMap: Map<string, string>
  ) {
    if (!headword) {
      console.log(`⚠️ Thiếu headword: ${headword}`);
      return null;
    }
    if (wordMap.has(headword)) {
      console.log(`⚠️ Bỏ qua từ đã có: ${headword}`);
      return wordMap.get(headword);
    }

    await this.delay(300);
    console.log(headword);
    const dictData = await this.fetchDictData(headword);
    if (!dictData?.phonetic || !dictData?.audio) {
      console.log(`❌ Bỏ qua từ: ${headword} - Thiếu phonetic hoặc audio`);
      return null;
    }

    const meaning = await this.translateToVi(headword);
    if (
      !meaning ||
      meaning.toLowerCase() === headword.toLowerCase() ||
      meaning.length <= 1
    ) {
      console.log(`❌ Bỏ qua từ: ${headword} - Nghĩa không hợp lệ`);
      return null;
    }

    const wd = await this.createWordIfNotExists(
      headword,
      dictData.phonetic,
      meaning,
      dictData.audio,
      wordMap
    );
    const wordId = wd.word_id;
    return wordId;
  }

  async getOrCreateCategoryWordPos(categoryId: string, wordPosId: string) {
    const categoryWordPos = await this.prisma.category_word_pos.findFirst({
      where: {
        category_id: categoryId,
        word_pos_id: wordPosId
      }
    });
    if (categoryWordPos == null) {
      await this.prisma.category_word_pos.create({
        data: {
          category_id: categoryId,
          word_pos_id: wordPosId
        }
      });
    }
  }
  async getOrCreateCategory(
    categoryName: string | null,
    categoryMap: Map<string, string>
  ) {
    if (!categoryName) return null;
    let id = categoryMap.get(categoryName.toLowerCase());
    if (!id) {
      const category = await this.prisma.categories.create({
        data: { category_name: categoryName.toLowerCase() }
      });
      id = category.category_id;
      categoryMap.set(categoryName.toLowerCase(), id);
    }
    return id;
  }

  async getOrCreateLevel(
    levelName: string | null,
    levelMap: Map<string, string>
  ) {
    if (!levelName) return null;
    let id = levelMap.get(levelName);
    if (!id) {
      const lvl = await this.prisma.levels.create({
        data: { level_name: levelName }
      });
      id = lvl.level_id;
      levelMap.set(levelName, id);
    }
    return id;
  }

  async getOrCreatePos(pos: string | null, tagMap: Map<string, string>) {
    if (!pos) return null;
    let id = tagMap.get(pos);
    if (!id) {
      const tg = await this.prisma.pos_tags.create({ data: { pos_tag: pos } });
      id = tg.pos_tag_id;
      tagMap.set(pos, id);
    }
    return id;
  }

  async createWordIfNotExists(
    headword: string,
    phonetic: string,
    meaning: string,
    audio: string,
    wordMap: Map<string, string>
  ) {
    if (wordMap.has(headword)) {
      return { word_id: wordMap.get(headword)! };
    }
    const wd = await this.prisma.words.create({
      data: { word: headword, phonetic, meaning_vi: meaning, audio }
    });
    wordMap.set(headword, wd.word_id);
    return wd;
  }

  async saveExamples(wordId: string, examples: string[]) {
    const data: { en: string; vi: string }[] = [];
    for (const example of examples) {
      const vi = await this.translateToVi(example);
      await this.delay(300);
      if (vi.length <= 70) data.push({ en: example, vi });
    }
    if (data.length > 0) {
      await this.prisma.word_example.createMany({
        data: data.map((e) => ({
          word_id: wordId,
          example: e.en,
          example_vi: e.vi
        }))
      });
    }
  }
}
