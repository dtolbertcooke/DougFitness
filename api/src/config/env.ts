// api/src/config/env.ts
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  MONGODB_URI: z.string().startsWith('mongodb'),
  JWT_SECRET: z.string().min(32),
  JWT_TTL: z.string().default('7d'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

let cached: z.infer<typeof Env> | undefined;

// Validated on first use, which server.ts triggers right after loading secrets.
// Throws a readable error if anything is missing or malformed.
export const env = () => (cached ??= Env.parse(process.env));
