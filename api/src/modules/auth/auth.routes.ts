// api/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { clientIp } from '../../middleware/clientIp';
import { postSignIn, postSignUp } from './auth.controller';

// A function, not a module-level router, so each app gets its own limiter (and its own counters).
export function createAuthRouter({ trustLambdaContext }: { trustLambdaContext: boolean }) {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    // See middleware/clientIp.ts for why the default (req.ip) can't tell Lambda callers apart.
    keyGenerator: (req) => ipKeyGenerator(clientIp(req, trustLambdaContext)),
    // The limiter warns when X-Forwarded-For is present but `trust proxy` is off. We deliberately never
    // read that header (a client controls it), so the warning is noise.
    validate: { xForwardedForHeader: false },
  });

  const authRouter = Router();
  authRouter.use(authLimiter);
  authRouter.post('/signup', postSignUp);
  authRouter.post('/signin', postSignIn);
  return authRouter;
}
