// api/test/setup.ts (referenced from vitest.config.ts as setupFiles)
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

let replset: MongoMemoryReplSet;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }, // transactions work
    // mongodb-memory-server's latest default binary is built for a newer macOS SDK than some
    // dev machines run, and aborts at launch with a missing-symbol dyld error. 7.0.x is broadly
    // compatible; bump it once that stops being true.
    binary: { version: '7.0.14' },
  });
  await mongoose.connect(replset.getUri());
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});
