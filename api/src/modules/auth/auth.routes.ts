// api/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { postSignIn, postSignUp } from './auth.controller';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter = Router();
authRouter.use(authLimiter);
authRouter.post('/signup', postSignUp);
authRouter.post('/signin', postSignIn);
