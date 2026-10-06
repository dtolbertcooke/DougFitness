// api/src/modules/auth/auth.service.ts
import argon2 from 'argon2';
import { AppError } from '../../middleware/errors';
import { User } from './user.model';
import { signToken } from './token';
import type { SignInSchema, SignUpSchema } from './auth.schemas';
import type { z } from 'zod';

// Hashed once at import time. signIn verifies against this when no user matches the email,
// so a lookup miss and a wrong password take the same amount of time and can't be told apart.
const TIMING_SAFE_DUMMY_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$13KgvjEX57eA/oIU7DC1Tg$Q/uSD3ygQQv6v8zONI4BmCKJy1Eq6VYKjEFru1BYc24';

const INVALID_CREDENTIALS = 'Invalid email or password';

export async function signUp(input: z.infer<typeof SignUpSchema>) {
  const passwordHash = await argon2.hash(input.password);
  try {
    const user = await User.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    });
    return { token: signToken(user.id), user: { id: user.id, email: user.email, displayName: user.displayName } };
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      throw new AppError(409, 'Email already in use');
    }
    throw err;
  }
}

export async function signIn(input: z.infer<typeof SignInSchema>) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const valid = await argon2.verify(user?.passwordHash ?? TIMING_SAFE_DUMMY_HASH, input.password);
  if (!user || !valid) throw new AppError(401, INVALID_CREDENTIALS);
  return { token: signToken(user.id), user: { id: user.id, email: user.email, displayName: user.displayName } };
}
