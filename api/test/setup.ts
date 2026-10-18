// api/test/setup.ts (referenced from vitest.config.ts as setupFiles)
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { MONGO_VERSION } from './mongo-version';

// Undefined until beforeAll succeeds. afterAll still runs when beforeAll throws, and a bare
// `replset.stop()` there would bury the real startup error under "cannot read properties of undefined".
let replset: MongoMemoryReplSet | undefined;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }, // transactions work
    binary: { version: MONGO_VERSION }, // downloaded once by global-setup.ts
    // Every test file starts its own mongod at the same moment. On a busy or cold machine that can take
    // longer than the library's 10s default, which fails the whole file with "Instance failed to start".
    instanceOpts: [{ launchTimeout: 60_000 }],
  });
  await mongoose.connect(replset.getUri());
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});
