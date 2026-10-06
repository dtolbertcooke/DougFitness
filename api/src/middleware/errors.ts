// api/src/middleware/errors.ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = () => {
  throw new AppError(404, 'Not found');
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  res.type('application/problem+json');
  if (err instanceof ZodError) {
    return res.status(400).json({ title: 'Validation failed', status: 400, errors: err.issues });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ title: err.message, status: err.status });
  }
  req.log.error({ err }, 'unhandled error');
  return res.status(500).json({ title: 'Internal Server Error', status: 500 });
};
