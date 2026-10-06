// api/src/middleware/requireAuth.ts
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errors';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../modules/auth/token';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError(401, 'Unauthorized');
  try {
    const claims = jwt.verify(token, env().JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    }) as jwt.JwtPayload;
    req.userId = claims.sub!;
    next();
  } catch {
    throw new AppError(401, 'Unauthorized');
  }
};
