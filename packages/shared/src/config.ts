import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgres://localhost:5432/screener'),
  ANTHROPIC_API_KEY: z.string().optional(),
  SCREENER_BASE_URL: z.string().default('https://www.screener.in'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
