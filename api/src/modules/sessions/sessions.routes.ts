// api/src/modules/sessions/sessions.routes.ts
import { Router } from 'express';
import {
  getSessionHandler,
  listSessionsHandler,
  postCompleteHandler,
  postSessionHandler,
  putEntryHandler,
} from './sessions.controller';

export const sessionsRouter = Router();
sessionsRouter.post('/', postSessionHandler);
sessionsRouter.get('/', listSessionsHandler);
sessionsRouter.get('/:id', getSessionHandler);
sessionsRouter.put('/:id/entries/:slotId', putEntryHandler);
sessionsRouter.post('/:id/complete', postCompleteHandler);
