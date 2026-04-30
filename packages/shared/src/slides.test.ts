import { describe, it, expect } from 'vitest';
import {
  ContentSlideConfigSchema,
  PollSlideConfigSchema,
  QuizSlideConfigSchema,
  QnaSlideConfigSchema,
  WordCloudSlideConfigSchema,
  PollResponseSchema,
  QuizResponseSchema,
  QnaResponseSchema,
  WordCloudResponseSchema,
} from './slides.js';

describe('PollSlideConfigSchema', () => {
  it('requires at least 2 choices', () => {
    expect(
      PollSlideConfigSchema.safeParse({
        question: 'Q?',
        choices: [{ id: 'a', text: 'A' }],
      }).success,
    ).toBe(false);
  });

  it('rejects more than 10 choices', () => {
    const choices = Array.from({ length: 11 }, (_, i) => ({ id: String(i), text: String(i) }));
    expect(PollSlideConfigSchema.safeParse({ question: 'Q?', choices }).success).toBe(false);
  });

  it('defaults multiSelect to false', () => {
    const parsed = PollSlideConfigSchema.parse({
      question: 'Q?',
      choices: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
    });
    expect(parsed.multiSelect).toBe(false);
  });

  it('rejects empty choice text', () => {
    expect(
      PollSlideConfigSchema.safeParse({
        question: 'Q?',
        choices: [
          { id: 'a', text: '' },
          { id: 'b', text: 'B' },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('QuizSlideConfigSchema', () => {
  it('clamps timeLimitMs to [5_000, 120_000]', () => {
    const base = {
      question: 'Q?',
      choices: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      correctChoiceId: 'a',
    };
    expect(QuizSlideConfigSchema.safeParse({ ...base, timeLimitMs: 4_999 }).success).toBe(false);
    expect(QuizSlideConfigSchema.safeParse({ ...base, timeLimitMs: 120_001 }).success).toBe(false);
    expect(QuizSlideConfigSchema.safeParse({ ...base, timeLimitMs: 20_000 }).success).toBe(true);
  });

  it('rejects more than 6 choices', () => {
    const choices = Array.from({ length: 7 }, (_, i) => ({ id: String(i), text: String(i) }));
    expect(
      QuizSlideConfigSchema.safeParse({
        question: 'Q?',
        choices,
        correctChoiceId: '0',
      }).success,
    ).toBe(false);
  });
});

describe('ContentSlideConfigSchema', () => {
  it('defaults title and body to empty strings', () => {
    const parsed = ContentSlideConfigSchema.parse({});
    expect(parsed.title).toBe('');
    expect(parsed.body).toBe('');
  });

  it('rejects non-URL imageUrl and non-https schemes', () => {
    expect(ContentSlideConfigSchema.safeParse({ imageUrl: 'not-a-url' }).success).toBe(false);
    expect(
      ContentSlideConfigSchema.safeParse({ imageUrl: 'http://example.com/x.png' }).success,
    ).toBe(false);
    expect(
      ContentSlideConfigSchema.safeParse({ imageUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(
      ContentSlideConfigSchema.safeParse({ imageUrl: 'https://example.com/x.png' }).success,
    ).toBe(true);
    expect(ContentSlideConfigSchema.safeParse({ imageUrl: null }).success).toBe(true);
  });
});

describe('QnaSlideConfigSchema', () => {
  it('defaults allowAnonymous to true', () => {
    expect(QnaSlideConfigSchema.parse({}).allowAnonymous).toBe(true);
  });
});

describe('WordCloudSlideConfigSchema', () => {
  it('clamps maxWordsPerParticipant to [1, 5]', () => {
    expect(
      WordCloudSlideConfigSchema.safeParse({ prompt: 'p', maxWordsPerParticipant: 0 }).success,
    ).toBe(false);
    expect(
      WordCloudSlideConfigSchema.safeParse({ prompt: 'p', maxWordsPerParticipant: 6 }).success,
    ).toBe(false);
    expect(
      WordCloudSlideConfigSchema.safeParse({ prompt: 'p', maxWordsPerParticipant: 3 }).success,
    ).toBe(true);
  });
});

describe('Response schemas', () => {
  it('PollResponse requires at least one choice', () => {
    expect(PollResponseSchema.safeParse({ choiceIds: [] }).success).toBe(false);
    expect(PollResponseSchema.safeParse({ choiceIds: ['a'] }).success).toBe(true);
  });

  it('QnaResponse caps text at 500 chars and rejects empty', () => {
    expect(QnaResponseSchema.safeParse({ text: '' }).success).toBe(false);
    expect(QnaResponseSchema.safeParse({ text: 'x'.repeat(500) }).success).toBe(true);
    expect(QnaResponseSchema.safeParse({ text: 'x'.repeat(501) }).success).toBe(false);
  });

  it('WordCloudResponse limits words to [1, 5]', () => {
    expect(WordCloudResponseSchema.safeParse({ words: [] }).success).toBe(false);
    expect(WordCloudResponseSchema.safeParse({ words: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
    expect(WordCloudResponseSchema.safeParse({ words: ['hi'] }).success).toBe(true);
  });

  it('QuizResponse requires choiceId only — server derives timing', () => {
    expect(QuizResponseSchema.safeParse({ choiceId: 'a' }).success).toBe(true);
    expect(QuizResponseSchema.safeParse({}).success).toBe(false);
    // Extra client-supplied fields like elapsedMs are accepted but ignored
    // (Zod's default object parsing strips unknown keys).
    const parsed = QuizResponseSchema.parse({ choiceId: 'a', elapsedMs: 9999 });
    expect(parsed).toEqual({ choiceId: 'a' });
  });
});
