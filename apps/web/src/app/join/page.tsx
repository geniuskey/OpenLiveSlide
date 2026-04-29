'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 6) {
      router.push(`/r/${trimmed}`);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Join a session</h1>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
        <input
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          className="rounded-md border border-slate-300 px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] uppercase focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:focus:border-slate-200"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
          disabled={code.trim().length !== 6}
        >
          Join
        </button>
      </form>
    </main>
  );
}
