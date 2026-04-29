import type { SlideType } from './slides';

export interface SessionStateDTO {
  id: string;
  joinCode: string;
  status: 'LOBBY' | 'LIVE' | 'ENDED';
  currentSlideId: string | null;
  participantCount: number;
}

export interface SlideDTO {
  id: string;
  order: number;
  type: SlideType;
  config: unknown;
}

export interface ParticipantDTO {
  id: string;
  nickname: string;
  score: number;
}

export interface PollAggregate {
  slideId: string;
  totals: Record<string, number>;
  totalResponses: number;
}

export interface QnaItem {
  id: string;
  text: string;
  nickname: string;
  upvotes: number;
  highlighted: boolean;
  completed: boolean;
  createdAt: string;
}

export interface WordCloudAggregate {
  slideId: string;
  words: { word: string; count: number }[];
}

export interface LeaderboardEntry {
  participantId: string;
  nickname: string;
  score: number;
}

export interface QuizTally {
  slideId: string;
  answeredCount: number;
}

export interface QuizReveal {
  slideId: string;
  totals: Record<string, number>;
  correctChoiceId: string;
  top: LeaderboardEntry[];
}

export interface QuizScoreFeedback {
  slideId: string;
  correct: boolean;
  scoreEarned: number;
  totalScore: number;
}

// Client → Server
export interface ClientToServerEvents {
  'audience:join': (
    payload: { joinCode: string; nickname: string; clientId: string },
    cb: (
      result:
        | {
            ok: true;
            participantId: string;
            session: SessionStateDTO;
            slide: SlideDTO | null;
            slideStartedAt: string | null;
          }
        | { ok: false; error: string },
    ) => void,
  ) => void;
  'audience:respond': (
    payload: { sessionId: string; slideId: string; payload: unknown },
    cb: (result: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'qna:upvote': (
    payload: { sessionId: string; responseId: string },
    cb?: (result: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'presenter:qnaHighlight': (payload: {
    sessionId: string;
    responseId: string;
    highlighted: boolean;
  }) => void;
  'presenter:qnaComplete': (payload: {
    sessionId: string;
    responseId: string;
    completed: boolean;
  }) => void;

  'presenter:join': (
    payload: { sessionId: string; token: string },
    cb: (
      result:
        | { ok: true; session: SessionStateDTO }
        | { ok: false; error: string },
    ) => void,
  ) => void;
  'presenter:advance': (payload: { sessionId: string; slideId: string }) => void;
  'presenter:start': (payload: { sessionId: string }) => void;
  'presenter:end': (payload: { sessionId: string }) => void;
}

// Server → Client
export interface ServerToClientEvents {
  'slide:changed': (payload: { slide: SlideDTO; startedAt: string }) => void;
  'session:ended': (payload: { sessionId: string }) => void;
  'participant:joined': (payload: { participant: ParticipantDTO }) => void;
  'participant:left': (payload: { participantId: string }) => void;
  'poll:aggregate': (payload: PollAggregate) => void;
  'wordcloud:aggregate': (payload: WordCloudAggregate) => void;
  'qna:items': (payload: { slideId: string; items: QnaItem[] }) => void;
  'quiz:tally': (payload: QuizTally) => void;
  'quiz:revealed': (payload: QuizReveal) => void;
  'quiz:score': (payload: QuizScoreFeedback) => void;
}
