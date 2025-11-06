import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from 'src/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import * as FormData from 'form-data';
import {
  WordRequest,
  WordPos,
  CsvRow,
  AudioCloudinary,
  ImageCloudinary
} from 'types/word';

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
          examples = wordPos
            ?.filter(
              (def) =>
                typeof def.example === 'string' &&
                def.example.includes(word) &&
                !def.example.includes(';') &&
                !def.example.includes('/') &&
                !def.example.includes('-') &&
                !def.example.includes('–') &&
                !def.example.includes('—') &&
                !def.example.includes('−') &&
                def.example.length <= 70
            )
            .map((def) =>
              typeof def.example === 'string'
                ? def.example
                    .split(' ')
                    .map((item) => item.trim())
                    .join(' ')
                : ''
            );
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
        }>(`http://127.0.0.1:4000/translate`, {
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
          example.toLowerCase() != example_vi.toLowerCase() &&
          example.length &&
          example_vi.length
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

  async getLevels() {
    return this.prisma.levels.findMany({
      orderBy: {
        level_name: 'asc'
      }
    });
  }

  async getPosTags() {
    return this.prisma.pos_tags.findMany({
      orderBy: {
        pos_tag: 'asc'
      }
    });
  }

  async getCategories() {
    return this.prisma.categories.findMany({
      orderBy: {
        category_name: 'asc'
      }
    });
  }

  async getWordsByWordPosIds(wordPosIds: string[]) {
    if (wordPosIds.length == 0) {
      return null;
    }
    return this.prisma.words.findMany({
      where: {
        word_pos: {
          some: {
            word_pos_id: {
              in: wordPosIds
            }
          }
        }
      },
      include: {
        word_pos: {
          include: {
            word_example: true,
            levels: true,
            pos_tags: true
          }
        }
      }
    });
  }

  async getWords(page: number = 0, limit: number = 10, search: string = '') {
    const skip = page * limit;

    // Tạo điều kiện tìm kiếm
    const where = search
      ? {
          OR: [
            { word: { contains: search, mode: Prisma.QueryMode.insensitive } }, // tìm trong trường "word"
            {
              meaning_vi: {
                contains: search,
                mode: Prisma.QueryMode.insensitive
              }
            } // nếu có trường "meaning"
          ]
        }
      : {};

    // Chạy song song để lấy danh sách và tổng số kết quả
    const [data, total] = await Promise.all([
      this.prisma.words.findMany({
        where,
        skip,
        take: limit,
        orderBy: { word: 'asc' }, // sắp xếp mới nhất lên đầu
        include: {
          word_pos: {
            include: {
              pos_tags: true,
              levels: true
            },
            orderBy: {
              levels: {
                level_name: 'asc'
              }
            }
          }
        }
      }),
      this.prisma.words.count({ where })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
  async saveAudio(
    file: Express.Multer.File,
    accessToken: string
  ): Promise<AudioCloudinary> {
    try {
      const formData = new FormData();
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });

      const { data } = await firstValueFrom(
        this.http.post(
          'http://localhost:4000/cloudinary/upload-audio',
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              Authorization: `Bearer ${accessToken}`
            }
          }
        )
      );

      return data.data as AudioCloudinary;
    } catch (error) {
      console.error('Error uploading audio:', error);
      throw new Error('Upload audio failed');
    }
  }

  async saveImages(
    files: Express.Multer.File[],
    accessToken: string,
    folder?: string
  ): Promise<ImageCloudinary[]> {
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype
        });
      });
      if (folder) formData.append('folder', folder);

      const { data } = await firstValueFrom(
        this.http.post(
          'http://localhost:4000/cloudinary/upload-images',
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              Authorization: `Bearer ${accessToken}`
            }
          }
        )
      );

      return data.data as ImageCloudinary[];
    } catch (error) {
      console.error('Error uploading images:', error);
      throw new Error('Upload images failed');
    }
  }
  async deleteAudio(publicId: string, accessToken: string) {
    try {
      const { data } = await firstValueFrom(
        this.http.delete('http://localhost:4000/cloudinary/delete-audio', {
          params: { publicId },
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      );
      return data;
    } catch (error) {
      console.error('Error deleting audio:', error);
      throw new Error('Delete audio failed');
    }
  }

  async deleteImages(publicIds: string[], accessToken: string) {
    try {
      const { data } = await firstValueFrom(
        this.http.delete('http://localhost:4000/cloudinary/delete-images', {
          data: { publicIds },
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      );
      return data;
    } catch (error) {
      console.error('Error deleting images:', error);
      throw new Error('Delete images failed');
    }
  }
  async addWord(
    wordReq: WordRequest,
    audioRes: AudioCloudinary,
    imageRes: ImageCloudinary[]
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const wordPosArr: WordPos[] = JSON.parse(wordReq.word_pos);
    if (
      imageRes.length > 0 &&
      wordReq.word_pos_image_metadata_index != undefined
    ) {
      imageRes.forEach((img, i) => {
        const idx = parseInt(
          wordReq.word_pos_image_metadata_index?.[i] ?? '-1'
        );
        if (idx >= 0 && wordPosArr[idx]) {
          wordPosArr[idx].imageUrl = img;
        }
      });
    }
    console.log(wordPosArr);
    const result = await this.prisma.$transaction(async (tx) => {
      const createdWord = await tx.words.create({
        data: {
          word: wordReq.word,
          meaning_vi: wordReq.meaning_vi,
          phonetic: wordReq.phonetic,
          audio: audioRes.secure_url,
          public_id: audioRes.public_id,
          word_pos: {
            create: wordPosArr.map((wordPos) => ({
              level_id: wordPos.level,
              pos_tag_id: wordPos.pos_tag,
              definition: wordPos.definition,
              word_example: {
                createMany: {
                  data: wordPos.examples.map((example) => ({
                    example: example.en,
                    example_vi: example.vi
                  }))
                }
              },
              image: wordPos.imageUrl?.secure_url ?? null,
              public_image_id: wordPos.imageUrl?.public_id ?? null
            }))
          }
        },
        include: {
          word_pos: true
        }
      });

      const categoryData = createdWord.word_pos.flatMap((wp, index) =>
        wordPosArr[index].categories.map((category_id) => ({
          word_pos_id: wp.word_pos_id,
          category_id
        }))
      );

      if (categoryData.length > 0) {
        await tx.category_word_pos.createMany({
          data: categoryData
        });
      }

      return createdWord;
    });
    return result;
  }
  async updateWord(
    wordId: string,
    wordReq: WordRequest,
    audioRes: AudioCloudinary | null,
    imageRes: AudioCloudinary[],
    token: string
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const wordPosArr: WordPos[] = JSON.parse(wordReq.word_pos);
    const [oldWordPos, newWordPos] = [
      wordPosArr.filter((wp) => wp.word_pos_id),
      wordPosArr.filter((wp) => !wp.word_pos_id)
    ];
    // return 'A';
    return this.prisma.$transaction(async (tx) => {
      const keepIds = oldWordPos.map((wp) => wp.word_pos_id!).filter(Boolean);
      if (oldWordPos.length) {
        const deleteWordPos = await tx.word_pos.findMany({
          where: {
            word_id: wordId,
            word_pos_id: { notIn: keepIds.length ? keepIds : undefined }
          }
        });
        if (deleteWordPos.length) {
          const deleteImages = deleteWordPos
            .map((wp) => wp.public_image_id)
            .filter((image) => image != null);
          if (deleteImages.length) {
            await this.deleteImages(
              deleteWordPos
                .map((wp) => wp.public_image_id)
                .filter((image) => image != null),
              token
            );
          }

          await tx.word_pos.deleteMany({
            where: { word_pos_id: { notIn: keepIds } }
          });
        }
      }

      if (
        imageRes.length &&
        wordReq.word_pos_image_metadata_index != undefined
      ) {
        imageRes.forEach((img, i) => {
          const idx = parseInt(
            wordReq.word_pos_image_metadata_index?.[i] ?? '-1'
          );
          if (idx >= 0 && wordPosArr[idx]) wordPosArr[idx].imageUrl = img;
        });
      }

      await Promise.all(
        oldWordPos.map(async (wp) => {
          await tx.category_word_pos.deleteMany({
            where: { word_pos_id: wp.word_pos_id }
          });
          await tx.word_example.deleteMany({
            where: {
              word_pos_id: wp.word_pos_id
            }
          });
          await tx.word_pos.update({
            where: { word_pos_id: wp.word_pos_id },
            data: {
              level_id: wp.level,
              pos_tag_id: wp.pos_tag,
              definition: wp.definition,
              word_example: {
                createMany: {
                  data: wp.examples.map((e) => ({
                    example: e.en,
                    example_vi: e.vi
                  }))
                }
              },
              image: wp.imageUrl?.secure_url ?? wp.image,
              public_image_id: wp.imageUrl?.public_id ?? wp.public_image_id,
              category_word_pos: {
                createMany: {
                  data: wp.categories.map((c) => ({
                    category_id: c
                  }))
                }
              }
            }
          });
        })
      );

      const updatedWord = await tx.words.update({
        where: { word_id: wordId },
        data: {
          word: wordReq.word,
          meaning_vi: wordReq.meaning_vi,
          phonetic: wordReq.phonetic,
          ...(audioRes && {
            audio: audioRes.secure_url,
            public_id: audioRes.public_id
          }),
          word_pos: {
            create: newWordPos.map((wp) => ({
              level_id: wp.level,
              pos_tag_id: wp.pos_tag,
              definition: wp.definition,
              word_example: {
                createMany: {
                  data: wp.examples.map((e) => ({
                    example: e.en,
                    example_vi: e.vi
                  }))
                }
              },
              image: wp.imageUrl?.secure_url ?? null,
              public_image_id: wp.imageUrl?.public_id ?? null
            }))
          }
        },
        include: { word_pos: { include: { word_example: true } } }
      });

      const newWordPosIds = updatedWord.word_pos
        .map((wp) => wp.word_pos_id)
        .filter((id) => !keepIds.includes(id));
      const categoryData = newWordPosIds.flatMap((id, i) =>
        newWordPos[i].categories.map((c) => ({
          word_pos_id: id,
          category_id: c
        }))
      );

      if (categoryData.length)
        await tx.category_word_pos.createMany({ data: categoryData });

      return updatedWord;
    });
  }

  async isWordExist(word: string): Promise<boolean> {
    const existing = await this.prisma.words.findUnique({
      where: { word },
      select: { word_id: true }
    });

    return !!existing;
  }

  async getWordById(wordId: string) {
    return this.prisma.words.findUnique({
      where: {
        word_id: wordId
      },
      include: {
        word_pos: {
          include: {
            word_example: true,
            category_word_pos: true
          }
        }
      }
    });
  }
  async deleteWord(wordId: string, token: string) {
    const word = await this.prisma.words.findUnique({
      where: { word_id: wordId },
      include: { word_pos: true }
    });

    if (!word) {
      throw new Error(`Word with ID ${wordId} not found`);
    }

    const deletePromises: Promise<any>[] = [];

    if (word.public_id) {
      deletePromises.push(this.deleteAudio(word.public_id, token));
    }

    const publicImageIds = word.word_pos
      .map((wp) => wp.public_image_id)
      .filter((id): id is string => !!id);

    if (publicImageIds.length > 0) {
      deletePromises.push(this.deleteImages(publicImageIds, token));
    }

    await Promise.allSettled(deletePromises);

    return this.prisma.words.delete({
      where: { word_id: wordId }
    });
  }
}
