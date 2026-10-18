// api/test/global-setup.ts (referenced from vitest.config.ts as globalSetup)
// Runs once in the main process, before any test worker starts. It makes sure the MongoDB binary is on disk.
//
// Without this, every test file's worker calls MongoMemoryReplSet.create at the same moment, and on a cold
// cache (a fresh CI runner) they all try to download the same binary into the same directory. The library's
// lock file can't arbitrate that reliably: workers fail with "Cannot unlock file ... not locked by this
// process" or "Instance failed to start", and the failure is random, so it can pass on a warm laptop and
// fail in CI. Downloading once up front means the workers only ever find a finished binary.
import { MongoBinary } from 'mongodb-memory-server';
import { MONGO_VERSION } from './mongo-version';

export default async function setup() {
  await MongoBinary.getPath({ version: MONGO_VERSION });
}
