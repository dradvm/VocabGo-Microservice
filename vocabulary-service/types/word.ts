export class WordRequest {
  word: string;
  phonetic: string;
  meaning_vi: string;
  word_pos: string;
  word_pos_image_metadata_index?: string[];
}
export class WordPos {
  word_pos_id?: string;
  word_id?: string;
  pos_tag_id: string;
  definition: string;
  level_id: string;
  image?: string;
  public_image_id?: string;
  word_example: WordExample[];
  category_word_pos: { category_id: string }[];
  pos_tag?: string;
  level?: string;
  examples: WordExample[];
  categories: string[];
  imageUrl?: ImageCloudinary;
}

export class WordExample {
  word_example_id?: string;
  en: string;
  vi: string;
}
export interface CsvRow {
  headword?: string;
  pos?: string;
  CEFR?: string;
  category1?: string;
  category2?: string;
  category3?: string;
}
export type AudioCloudinary = {
  public_id: string;
  secure_url: string;
};

export type ImageCloudinary = {
  public_id: string;
  secure_url: string;
};
