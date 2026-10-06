// api/src/modules/me/me.schemas.ts
import { z } from 'zod';

// .strict() with no `password` key: a client that sends `password` here gets a 400 from Zod,
// not a silent plaintext-password update (that was v1's updateUser bug).
export const PatchMeSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
  })
  .partial()
  .strict();

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256),
});
