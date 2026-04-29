'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginResult } from './actions';

const initialState: LoginResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
    >
      {pending ? 'Logging in…' : 'Log in'}
    </button>
  );
}

export default function LoginPage() {
  const search = useSearchParams();
  const callbackUrl = search.get('callbackUrl') ?? '';
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Presenter login</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton />
      </form>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        No account?{' '}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
