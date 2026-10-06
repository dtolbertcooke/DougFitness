// api/src/server.ts
import mongoose from 'mongoose';
import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { loadSsmParams } from './lib/ssm';

async function main() {
  // In AWS, secrets come from SSM Parameter Store (Phase 3). Locally they come from .env.
  if (process.env.SSM_PREFIX) await loadSsmParams(process.env.SSM_PREFIX);
  const config = env(); // fail fast here if anything is missing

  // Small pool: on Lambda each warm instance keeps its own connections.
  await mongoose.connect(config.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  buildApp().listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
