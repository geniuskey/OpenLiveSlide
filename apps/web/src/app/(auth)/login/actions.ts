'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
});

export type LoginResult = { error?: string };

export async function loginAction(_prev: LoginResult, form: FormData): Promise<LoginResult> {
  const parsed = schema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    callbackUrl: form.get('callbackUrl') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid input' };

  try {
    await signIn('credentials', {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Invalid email or password' };
    throw err;
  }

  redirect(parsed.data.callbackUrl?.startsWith('/') ? parsed.data.callbackUrl : '/dashboard');
}
