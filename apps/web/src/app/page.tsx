import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="text-5xl font-bold tracking-tight">OpenLiveSlide</h1>
      <p className="max-w-xl text-lg text-slate-600 dark:text-slate-400">
        Open-source interactive presentations. Run polls, quizzes, Q&amp;A, and word clouds with
        your audience in real time.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Presenter login
        </Link>
        <Link
          href="/join"
          className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Join with code
        </Link>
      </div>
    </main>
  );
}
