// api/test/mongo-version.ts
// The MongoDB binary the tests run against. Shared by global-setup.ts (downloads it) and setup.ts (starts it),
// which must agree or each worker would download a second copy.
//
// mongodb-memory-server's latest default binary is built for a newer macOS SDK than some dev machines run,
// and aborts at launch with a missing-symbol dyld error. 7.0.x is broadly compatible; bump it once that
// stops being true.
export const MONGO_VERSION = '7.0.14';
