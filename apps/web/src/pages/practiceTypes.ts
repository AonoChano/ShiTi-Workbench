/** 答题页共享类型（Practice 与 QuestionNavigator 共用）。 */

export interface Option { id: string; text: string }
export interface Block { id: string; type: string; text: string }

export interface ItemDTO {
  attempt_item_id: string;
  order: number;
  type: 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'free_text';
  stem: string;
  options: Option[] | null;
  images?: string[] | null;
  section?: string | null;
  max_score_units: number;
  has_answer_key: boolean;
  material: { id: string; title: string; blocks: Block[] } | null;
  draft: { answer: unknown; confidence: string | null; reasoning: string | null; flagged: boolean; revision: number } | null;
}

export interface SetSection { id: string; part?: string; title: string; directions?: string[] }

export interface AttemptDTO {
  attempt_id: string; state: string; mode: string; set_title: string;
  sections?: SetSection[];
  revision: number; writer_epoch: number; lease_expires_at: number | null;
  started_at: string | null; server_time: number;
  items: ItemDTO[];
}

export interface Draft { answer: unknown; confidence: string | null; reasoning: string | null; flagged: boolean; revision: number }
