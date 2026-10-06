// api/src/modules/auth/auth.controller.ts
import type { RequestHandler } from 'express';
import { SignInSchema, SignUpSchema } from './auth.schemas';
import { signIn, signUp } from './auth.service';

export const postSignUp: RequestHandler = async (req, res) => {
  const input = SignUpSchema.parse(req.body);
  const result = await signUp(input);
  res.status(201).json(result);
};

export const postSignIn: RequestHandler = async (req, res) => {
  const input = SignInSchema.parse(req.body);
  const result = await signIn(input);
  res.status(200).json(result);
};
