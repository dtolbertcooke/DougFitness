// api/src/modules/progress/progress.controller.ts
import type { RequestHandler } from 'express';
import { SlotParamsSchema } from '../sessions/sessions.schemas';
import { slotProgress } from './progress.service';

export const getProgressHandler: RequestHandler = async (req, res) => {
  const { slotId } = SlotParamsSchema.parse(req.params);
  res.status(200).json(await slotProgress(req.userId, slotId));
};
