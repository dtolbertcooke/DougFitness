// api/src/types/express.d.ts
// Augments Express's Request with the id requireAuth sets from the verified JWT.
// Routes filter every query by this value; it is never taken from the client.
import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}
