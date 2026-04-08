import 'dotenv/config';
import { z } from 'zod';

// Preprocess: treat empty strings as undefined so .default() kicks in
const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgres://localhost:5432/screener'),
  NEON_DATABASE_URL: z.preprocess(emptyToUndef, z.string().optional()),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndef, z.string().optional()),
  SCREENER_BASE_URL: z.string().default('https://www.screener.in'),
  NODE_ENV: z.preprocess(emptyToUndef, z.enum(['development', 'production', 'test']).default('development')),
  LLM_PROVIDER: z.preprocess(emptyToUndef, z.enum(['anthropic', 'local']).default('local')),
  LOCAL_LLM_URL: z.preprocess(emptyToUndef, z.string().default('http://192.168.0.42:8000')),
  LOCAL_LLM_MODEL: z.preprocess(emptyToUndef, z.string().default('qwen3.5-35b-a3b')),
  LOCAL_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
