// api/src/modules/program/program.routes.ts
import { Router } from 'express';
import { getProgramHandler } from './program.controller';

export const programRouter = Router();
programRouter.get('/', getProgramHandler);
