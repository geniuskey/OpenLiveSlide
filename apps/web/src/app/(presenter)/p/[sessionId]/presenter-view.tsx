'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  PollAggregate,
  QnaItem,
  QuizReveal,
  QuizTally,
  ServerToClientEvents,
  WordCloudAggregate,
} from '@openliveslide/shared';
import { ContentSlideConfigSchema } from '@openliveslide/shared';
import type { SlideType } from '@openliveslide/db';
import { PollChart } from './poll-chart';
import { QuizView } from './quiz-view';
import { QnaView } from './qna-view';
import { WordCloudView } from './wordcloud-view';
import { JoinCard } from './join-card';

interface PresenterSlide {
  id: string;
  order: number;
  type: SlideType;
  config: Record<string, unknown>;
}

interface PresenterViewProps {
  realtimeUrl: string;
  token: string;
  session: {
    id: string;
    joinCode: string;
    status: 'LOBBY' | 'LIVE' | 'ENDED';
    currentSlideId: string | null;
  };
  slides: PresenterSlide[];
}

type PresenterSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function PresenterView({ realtimeUrl, token, session, slides }: PresenterViewProps) {
  const [status, setStatus] = useState(session.status);
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(session.currentSlideId);
  const [participantCount, setParticipantCount] = useState(0);
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [pollAggregate, setPollAggregate] = useState<PollAggregate | null>(null);
  const [quizTally, setQuizTally] = useState<QuizTally | null>(null);
  const [quizReveal, setQuizReveal] = useState<QuizReveal | null>(null);
  const [qnaItems, setQnaItems] = useState<{ slideId: string; items: QnaItem[] } | null>(null);
  const [wordCloud, setWordCloud] = useState<WordCloudAggregate | null>(null);
  const [slideStartedAt, setSlideStartedAt] = useState<number>(() => Date.now());
  const socketRef = useRef<PresenterSocket | null>(null);

  const currentSlide = useMemo(
    () => slides.find((s) => s.id === currentSlideId) ?? null,
    [slides, currentSlideId],
  );

  useEffect(() => {
    const socket: PresenterSocket = io(realtimeUrl, {
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('presenter:join', { sessionId: session.id, token }, (res) => {
        if (res.ok) {
          setConnState('connected');
          // Initial value from DB (cumulative). The server will follow up
          // with participant:count events carrying the live active count.
          setParticipantCount(res.session.participantCount);
        } else {
          setConnState('error');
          console.error('presenter:join failed', res.error);
        }
      });
    });
    socket.on('connect_error', () => setConnState('error'));
    socket.on('slide:changed', ({ slide, startedAt }) => {
      setCurrentSlideId(slide.id);
      const t = Date.parse(startedAt);
      setSlideStartedAt(Number.isFinite(t) ? t : Date.now());
      setPollAggregate(null);
      setQuizTally(null);
      setQuizReveal(null);
      setQnaItems(null);
      setWordCloud(null);
    });
    // Server-authoritative count of currently-connected audience sockets.
    // This replaces a manual increment on participant:joined and gives the
    // correct number even after disconnects.
    socket.on('participant:count', ({ active }) => setParticipantCount(active));
    socket.on('session:ended', () => setStatus('ENDED'));
    socket.on('poll:aggregate', (agg) => setPollAggregate(agg));
    socket.on('quiz:tally', (t) => setQuizTally(t));
    socket.on('quiz:revealed', (r) => setQuizReveal(r));
    socket.on('qna:items', (p) => setQnaItems(p));
    socket.on('wordcloud:aggregate', (a) => setWordCloud(a));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [realtimeUrl, session.id, token]);

  const start = useCallback(() => {
    socketRef.current?.emit('presenter:start', { sessionId: session.id });
    setStatus('LIVE');
  }, [session.id]);

  const advance = useCallback(
    (dir: -1 | 1) => {
      if (!currentSlide) return;
      const idx = slides.findIndex((s) => s.id === currentSlide.id);
      const next = slides[idx + dir];
      if (!next) return;
      socketRef.current?.emit('presenter:advance', { sessionId: session.id, slideId: next.id });
      setCurrentSlideId(next.id);
    },
    [currentSlide, slides, session.id],
  );

  const end = useCallback(() => {
    socketRef.current?.emit('presenter:end', { sessionId: session.id });
  }, [session.id]);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (status !== 'LIVE') return;
      if (e.key === 'ArrowRight' || e.key === ' ') advance(1);
      else if (e.key === 'ArrowLeft') advance(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, status]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3 text-sm">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connState === 'connected'
                ? 'bg-emerald-500'
                : connState === 'error'
                  ? 'bg-red-500'
                  : 'bg-amber-500'
            }`}
          />
          <span>Status: {status}</span>
          <span className="text-slate-500">·</span>
          <span>{participantCount} joined</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs"
          >
            Fullscreen
          </button>
          {status === 'LOBBY' && (
            <button
              type="button"
              onClick={start}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-700"
            >
              Start session
            </button>
          )}
          {status === 'LIVE' && (
            <button
              type="button"
              onClick={end}
              className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-700"
            >
              End session
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center p-12">
        {status === 'LOBBY' || !currentSlide ? (
          <Lobby joinCode={session.joinCode} />
        ) : (
          <SlideRenderer
            slide={currentSlide}
            sessionId={session.id}
            joinCode={session.joinCode}
            pollAggregate={pollAggregate}
            quizTally={quizTally}
            quizReveal={quizReveal}
            qnaItems={qnaItems}
            wordCloud={wordCloud}
            slideStartedAt={slideStartedAt}
            socket={socketRef.current}
          />
        )}
      </div>

      <footer className="border-t border-slate-800 px-6 py-2 text-xs text-slate-500">
        ← / → or Space to advance · {slides.findIndex((s) => s.id === currentSlideId) + 1} /{' '}
        {slides.length}
      </footer>
    </main>
  );
}

function Lobby({ joinCode }: { joinCode: string }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <JoinCard joinCode={joinCode} />
      <p className="text-slate-400">Press “Start session” when you're ready.</p>
    </div>
  );
}

function SlideRenderer({
  slide,
  sessionId,
  joinCode,
  pollAggregate,
  quizTally,
  quizReveal,
  qnaItems,
  wordCloud,
  slideStartedAt,
  socket,
}: {
  slide: PresenterSlide;
  sessionId: string;
  joinCode: string;
  pollAggregate: PollAggregate | null;
  quizTally: QuizTally | null;
  quizReveal: QuizReveal | null;
  qnaItems: { slideId: string; items: QnaItem[] } | null;
  wordCloud: WordCloudAggregate | null;
  slideStartedAt: number;
  socket: PresenterSocket | null;
}) {
  if (slide.type === 'POLL') {
    return (
      <PollChart
        slide={{ id: slide.id, order: slide.order, type: slide.type, config: slide.config }}
        aggregate={pollAggregate?.slideId === slide.id ? pollAggregate : null}
        joinCode={joinCode}
      />
    );
  }
  if (slide.type === 'QUIZ') {
    return (
      <QuizView
        slide={{ id: slide.id, order: slide.order, type: slide.type, config: slide.config }}
        startedAt={slideStartedAt}
        tally={quizTally}
        reveal={quizReveal}
        joinCode={joinCode}
      />
    );
  }
  if (slide.type === 'QNA') {
    return (
      <QnaView
        slide={{ id: slide.id, order: slide.order, type: slide.type, config: slide.config }}
        sessionId={sessionId}
        joinCode={joinCode}
        items={qnaItems?.slideId === slide.id ? qnaItems.items : []}
        socket={socket}
      />
    );
  }
  if (slide.type === 'WORDCLOUD') {
    return (
      <WordCloudView
        slide={{ id: slide.id, order: slide.order, type: slide.type, config: slide.config }}
        aggregate={wordCloud?.slideId === slide.id ? wordCloud : null}
        joinCode={joinCode}
      />
    );
  }
  if (slide.type === 'CONTENT') {
    const cfg = ContentSlideConfigSchema.catch({ title: '', body: '', imageUrl: null }).parse(
      slide.config,
    );
    return (
      <div className="flex w-full max-w-5xl flex-col items-center gap-6 text-center">
        {cfg.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cfg.imageUrl} alt="" className="max-h-72 rounded-md object-contain" />
        ) : null}
        {cfg.title ? <h1 className="text-6xl font-bold">{cfg.title}</h1> : null}
        {cfg.body ? (
          <p className="max-w-3xl whitespace-pre-wrap text-2xl text-slate-300">{cfg.body}</p>
        ) : null}
        <span className="mt-4 font-mono text-sm text-slate-500">Code {joinCode}</span>
      </div>
    );
  }
  return (
    <div className="text-center">
      <p className="text-3xl">{slide.type} slide</p>
      <p className="mt-3 text-slate-400">Renderer arrives in a later milestone.</p>
      <span className="mt-4 block font-mono text-sm text-slate-500">Code {joinCode}</span>
    </div>
  );
}
