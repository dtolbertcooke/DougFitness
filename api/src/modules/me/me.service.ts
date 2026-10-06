// api/src/modules/me/me.service.ts
import argon2 from 'argon2';
import { AppError } from '../../middleware/errors';
import { User } from '../auth/user.model';
import type { ChangePasswordSchema, PatchMeSchema } from './me.schemas';
import type { z } from 'zod';

// passwordHash is select: false on the schema, so this never returns it.
export function getMe(userId: string) {
  return User.findById(userId).orFail(new AppError(404, 'Not found'));
}

export function patchMe(userId: string, input: z.infer<typeof PatchMeSchema>) {
  return User.findByIdAndUpdate(userId, input, { returnDocument: 'after' }).orFail(new AppError(404, 'Not found'));
}

export async function changePassword(userId: string, input: z.infer<typeof ChangePasswordSchema>) {
  const user = await User.findById(userId).select('+passwordHash').orFail(new AppError(404, 'Not found'));
  const valid = await argon2.verify(user.passwordHash, input.currentPassword);
  if (!valid) throw new AppError(401, 'Current password is incorrect');
  user.passwordHash = await argon2.hash(input.newPassword);
  await user.save();
}

export async function deleteMe(userId: string) {
  // No sessions to cascade yet; Phase 2 adds WorkoutSession.deleteMany({ userId }) here.
  await User.findByIdAndDelete(userId).orFail(new AppError(404, 'Not found'));
}
