// api/src/modules/auth/auth.schemas.ts
import { z } from 'zod';

export const SignUpSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(256), // upper bound so a huge body can't force an expensive hash
  displayName: z.string().trim().min(1).max(80),
});

export const SignInSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});
