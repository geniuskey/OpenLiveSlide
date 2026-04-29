'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, SlideDTO } from '@openliveslide/shared';
import { PollSlide } from './poll-slide';
import { QuizSlide } from './quiz-slide';

type AudienceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const CLIENT_ID_KEY = 'ols.clientId';
const NICKNAME_KEY = 'ols.nickname';

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

interface Props {
  realtimeUrl: string;
  joinCode: string;
}

type Phase = 'nickname' | 'joining' | 'connected' | 'error';

export function AudienceView({ realtimeUrl, joinCode }: Props) {
  const [nickname, setNickname] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('nickname');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [slide, setSlide] = useState<SlideDTO | null>(null);
  const [slideStartedAt, setSlideStartedAt] = useState<number>(() => Date.now());
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const socketRef = useRef<AudienceSocket | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(NICKNAME_KEY);
    if (stored) {
      setNickname(stored);
      setPhase('joining');
    }
  }, []);

  useEffect(() => {
    if (phase !== 'joining') return;

    const clientId = getOrCreateClientId();
    const socket: AudienceSocket = io(realtimeUrl, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit(
        'audience:join',
        { joinCode, nickname: nickname.trim() || `Guest-${clientId.slice(0, 4)}`, clientId },
        (res) => {
          if (res.ok) {
            setPhase('connected');
            setSlide(res.slide);
            setSlideStartedAt(Date.now());
            setSessionId(res.session.id);
          } else {
            setPhase('error');
            setErrorMsg(res.error);
          }
        },
      );
    });
    socket.on('slide:changed', ({ slide, startedAt }) => {
      setSlide(slide);
      const t = Date.parse(startedAt);
      setSlideStartedAt(Number.isFinite(t) ? t : Date.now());
    });
    socket.on('session:ended', () => setSessionEnded(true));
    socket.on('connect_error', () => {
      setPhase('error');
      setErrorMsg('connection_failed');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [phase, realtimeUrl, joinCode, nickname]);

  function onNicknameSubmit(e: FormEvent) {
    e.preventDefault();
    window.localStorage.setItem(NICKNAME_KEY, nickname.trim());
    setPhase('joining');
  }

  if (phase === 'nickname') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
        <p className="text-sm text-slate-500">Joining session</p>
        <p className="font-mono text-4xl tracking-[0.4em]">{joinCode}</p>
        <form onSubmit={onNicknameSubmit} className="flex w-full flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Your nickname
            <input
              autoFocus
              maxLength={32}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-2xl font-semibold">Couldn't join</p>
        <p className="text-sm text-slate-500">{errorMsg ?? 'Unknown error'}</p>
        <a href="/join" className="text-sm underline">
          Try a different code
        </a>
      </main>
    );
  }

  if (sessionEnded) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-2xl font-semibold">Session ended</p>
        <p className="text-sm text-slate-500">Thanks for joining.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8">
      {slide && sessionId ? (
        <AudienceSlide
          slide={slide}
          sessionId={sessionId}
          startedAt={slideStartedAt}
          socket={socketRef.current}
        />
      ) : (
        <Waiting />
      )}
    </main>
  );
}

function Waiting() {
  return (
    <div className="text-center">
      <p className="animate-pulse text-lg text-slate-500">Waiting for the presenter…</p>
    </div>
  );
}

function AudienceSlide({
  slide,
  sessionId,
  startedAt,
  socket,
}: {
  slide: SlideDTO;
  sessionId: string;
  startedAt: number;
  socket: AudienceSocket | null;
}) {
  if (slide.type === 'CONTENT') {
    const cfg = slide.config as { title?: string; body?: string };
    return (
      <div className="text-center">
        {cfg.title ? <h1 className="text-3xl font-bold">{cfg.title}</h1> : null}
        {cfg.body ? (
          <p className="mt-3 whitespace-pre-wrap text-slate-600 dark:text-slate-400">{cfg.body}</p>
        ) : null}
      </div>
    );
  }
  if (slide.type === 'POLL') {
    return <PollSlide slide={slide} sessionId={sessionId} socket={socket} />;
  }
  if (slide.type === 'QUIZ') {
    return (
      <QuizSlide slide={slide} sessionId={sessionId} startedAt={startedAt} socket={socket} />
    );
  }
  return (
    <div className="text-center">
      <p className="text-lg text-slate-500">
        {slide.type} interaction lands in a later milestone.
      </p>
    </div>
  );
}
