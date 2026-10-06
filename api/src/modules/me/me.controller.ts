// api/src/modules/me/me.controller.ts
import type { RequestHandler } from 'express';
import { ChangePasswordSchema, PatchMeSchema } from './me.schemas';
import { changePassword, deleteMe, getMe, patchMe } from './me.service';

export const getMeHandler: RequestHandler = async (req, res) => {
  const user = await getMe(req.userId);
  res.status(200).json({ id: user.id, email: user.email, displayName: user.displayName });
};

export const patchMeHandler: RequestHandler = async (req, res) => {
  const input = PatchMeSchema.parse(req.body);
  const user = await patchMe(req.userId, input);
  res.status(200).json({ id: user.id, email: user.email, displayName: user.displayName });
};

export const postChangePasswordHandler: RequestHandler = async (req, res) => {
  const input = ChangePasswordSchema.parse(req.body);
  await changePassword(req.userId, input);
  res.status(204).send();
};

export const deleteMeHandler: RequestHandler = async (req, res) => {
  await deleteMe(req.userId);
  res.status(204).send();
};
