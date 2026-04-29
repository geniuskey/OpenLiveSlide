'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { signupAction, type SignupResult } from './actions';

const initialState: SignupResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
    >
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  );
}

export default function SignupPage() {
  const [state, formAction] = useFormState(signupAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Create presenter account</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name (optional)
          <input
            name="name"
            type="text"
            className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
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
          Password (min 8 chars)
          <input
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton />
      </form>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{' '}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
