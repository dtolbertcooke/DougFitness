// api/src/modules/me/me.routes.ts
import { Router } from 'express';
import { deleteMeHandler, getMeHandler, patchMeHandler, postChangePasswordHandler } from './me.controller';

export const meRouter = Router();
meRouter.get('/', getMeHandler);
meRouter.patch('/', patchMeHandler);
meRouter.post('/password', postChangePasswordHandler);
meRouter.delete('/', deleteMeHandler);
