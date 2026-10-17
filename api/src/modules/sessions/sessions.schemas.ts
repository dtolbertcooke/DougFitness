// api/src/modules/sessions/sessions.schemas.ts
import { z } from 'zod';

// Not Types.ObjectId.isValid: that also accepts any 12-character string.
const ObjectIdString = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id');

export const StartSessionSchema = z.object({ day: z.int().min(1).max(7) }).strict();

export const SessionParamsSchema = z.object({ id: ObjectIdString });

export const EntryParamsSchema = z.object({ id: ObjectIdString, slotId: z.string().min(1).max(64) });

// Log or replace one exercise: sets of reps/seconds with an optional weight, or a cardio block.
export const EntryBodySchema = z.union([
  z
    .object({
      weight: z.number().min(0).max(2000).nullable().default(null),
      values: z.array(z.number().min(0).max(10_000)).min(1).max(20),
    })
    .strict(),
  z
    .object({
      cardio: z
        .object({
          minutes: z.number().min(0).max(1000),
          speedMph: z.number().min(0).max(30).optional(),
          inclinePct: z.number().min(0).max(100).optional(),
        })
        .strict(),
    })
    .strict(),
]);

export const ListSessionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().max(200).optional(),
  })
  .strict();

export const SlotParamsSchema = z.object({ slotId: z.string().min(1).max(64) });
