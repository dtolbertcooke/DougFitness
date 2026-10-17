// api/src/modules/progress/progress.routes.ts
import { Router } from 'express';
import { getProgressHandler } from './progress.controller';

export const progressRouter = Router();
progressRouter.get('/:slotId', getProgressHandler);
