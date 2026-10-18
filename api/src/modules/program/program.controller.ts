// api/src/modules/program/program.controller.ts
import type { RequestHandler } from 'express';
import { getProgram } from './program.service';

export const getProgramHandler: RequestHandler = async (req, res) => {
  res.status(200).json(await getProgram(req.userId));
};
