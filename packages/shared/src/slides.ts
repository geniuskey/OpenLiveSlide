import { z } from 'zod';

export const SlideTypeSchema = z.enum(['CONTENT', 'POLL', 'QUIZ', 'QNA', 'WORDCLOUD']);
export type SlideType = z.infer<typeof SlideTypeSchema>;

export const ContentSlideConfigSchema = z.object({
  title: z.string().default(''),
  body: z.string().default(''),
  imageUrl: z.string().url().nullable().optional(),
});
export type ContentSlideConfig = z.infer<typeof ContentSlideConfigSchema>;

export const PollChoiceSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
});

export const PollSlideConfigSchema = z.object({
  question: z.string().min(1),
  choices: z.array(PollChoiceSchema).min(2).max(10),
  multiSelect: z.boolean().default(false),
});
export type PollSlideConfig = z.infer<typeof PollSlideConfigSchema>;

export const QuizSlideConfigSchema = z.object({
  question: z.string().min(1),
  choices: z.array(PollChoiceSchema).min(2).max(6),
  correctChoiceId: z.string(),
  timeLimitMs: z.number().int().min(5_000).max(120_000).default(20_000),
  pointsBase: z.number().int().min(0).default(1000),
});
export type QuizSlideConfig = z.infer<typeof QuizSlideConfigSchema>;

export const QnaSlideConfigSchema = z.object({
  prompt: z.string().default('Ask a question'),
  allowAnonymous: z.boolean().default(true),
});
export type QnaSlideConfig = z.infer<typeof QnaSlideConfigSchema>;

export const WordCloudSlideConfigSchema = z.object({
  prompt: z.string().min(1),
  maxWordsPerParticipant: z.number().int().min(1).max(5).default(3),
});
export type WordCloudSlideConfig = z.infer<typeof WordCloudSlideConfigSchema>;

export const SlideConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CONTENT'), config: ContentSlideConfigSchema }),
  z.object({ type: z.literal('POLL'), config: PollSlideConfigSchema }),
  z.object({ type: z.literal('QUIZ'), config: QuizSlideConfigSchema }),
  z.object({ type: z.literal('QNA'), config: QnaSlideConfigSchema }),
  z.object({ type: z.literal('WORDCLOUD'), config: WordCloudSlideConfigSchema }),
]);

// ---- Response payloads ----

export const PollResponseSchema = z.object({
  choiceIds: z.array(z.string()).min(1),
});
export type PollResponse = z.infer<typeof PollResponseSchema>;

export const QuizResponseSchema = z.object({
  choiceId: z.string(),
  elapsedMs: z.number().int().min(0),
});
export type QuizResponse = z.infer<typeof QuizResponseSchema>;

export const QnaResponseSchema = z.object({
  text: z.string().min(1).max(500),
});
export type QnaResponse = z.infer<typeof QnaResponseSchema>;

export const WordCloudResponseSchema = z.object({
  words: z.array(z.string().min(1).max(40)).min(1).max(5),
});
export type WordCloudResponse = z.infer<typeof WordCloudResponseSchema>;
