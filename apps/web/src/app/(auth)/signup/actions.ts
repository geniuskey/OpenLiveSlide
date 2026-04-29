'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@openliveslide/db';
import { signIn } from '@/auth';

const schema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().trim().max(80).optional(),
});

export type SignupResult = { error?: string };

export async function signupAction(_prev: SignupResult, form: FormData): Promise<SignupResult> {
  const parsed = schema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    name: form.get('name') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: 'Email already in use' };

  const hash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: { email: parsed.data.email, password: hash, name: parsed.data.name },
  });

  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect('/dashboard');
}
