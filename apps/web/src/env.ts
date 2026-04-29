import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  REALTIME_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_REALTIME_URL: z.string().url().default('http://localhost:4000'),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  REALTIME_URL: process.env.REALTIME_URL,
  NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
});
