// api/src/modules/sessions/sessions.service.ts
import mongoose from 'mongoose';
import type { z } from 'zod';
import { AppError } from '../../middleware/errors';
import { nextState } from '../../program/progression';
import { SLOT_INDEX } from '../../program/slots';
import { ensureProgramState } from '../program/program.service';
import { WorkoutSession } from './session.model';
import type { EntryBodySchema, ListSessionsQuerySchema } from './sessions.schemas';

type SessionDoc = InstanceType<typeof WorkoutSession>;

export function toDto(s: SessionDoc) {
  return {
    id: s.id as string,
    day: s.day,
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt ?? null,
    entries: s.entries.map((e) => ({
      slotId: e.slotId,
      weight: e.weight ?? null,
      values: [...e.values],
      ...(e.cardio?.minutes !== undefined
        ? { cardio: { minutes: e.cardio.minutes, speedMph: e.cardio.speedMph, inclinePct: e.cardio.inclinePct } }
        : {}),
    })),
  };
}

function isDuplicateKey(err: unknown) {
  return !!err && typeof err === 'object' && 'code' in err && err.code === 11000;
}

// Every lookup filters by userId. Someone else's session is indistinguishable from a missing one: 404.
export function getSession(userId: string, sessionId: string) {
  return WorkoutSession.findOne({ _id: sessionId, userId }).orFail(new AppError(404, 'Not found'));
}

export async function startSession(userId: string, day: number, startedAt = new Date()) {
  try {
    return await WorkoutSession.create({ userId, day, startedAt });
  } catch (err) {
    // The partial unique index (one in_progress session per user) rejected it.
    if (isDuplicateKey(err)) throw new AppError(409, 'A session is already in progress');
    throw err;
  }
}

export async function logEntry(
  userId: string,
  sessionId: string,
  slotId: string,
  body: z.infer<typeof EntryBodySchema>,
) {
  const session = await getSession(userId, sessionId);
  if (session.status !== 'in_progress') throw new AppError(409, 'Session is already completed');

  const info = SLOT_INDEX.get(slotId);
  if (!info || info.day !== session.day) throw new AppError(400, 'Exercise is not part of this session');
  const { slot } = info;

  let entry: Record<string, unknown>;
  if ('cardio' in body) {
    if (slot.unit !== 'minutes') throw new AppError(400, 'Cardio details only apply to timed cardio exercises');
    entry = { slotId, weight: null, values: [], cardio: body.cardio };
  } else {
    if (slot.unit === 'minutes') throw new AppError(400, 'Log cardio exercises with { cardio }');
    if (body.values.length > slot.sets) throw new AppError(400, `At most ${slot.sets} sets can be logged`);
    entry = { slotId, weight: body.weight, values: body.values };
  }

  // One atomic update that swaps the entry for this slot (PUT semantics: replacing is idempotent, and a
  // retry after a dropped connection gives the same result). The status filter closes the window
  // where the session is completed between the check above and this write.
  const result = await WorkoutSession.updateOne(
    { _id: sessionId, userId, status: 'in_progress' },
    [
      {
        $set: {
          entries: {
            $concatArrays: [
              { $filter: { input: '$entries', cond: { $ne: ['$$this.slotId', slotId] } } },
              { $literal: [entry] },
            ],
          },
        },
      },
    ],
    { updatePipeline: true }, // Mongoose 9 requires an explicit opt-in for aggregation-pipeline updates
  );
  if (result.matchedCount === 0) throw new AppError(409, 'Session is already completed');
  return getSession(userId, sessionId);
}

// Cursor = base64url(JSON { t: startedAt ISO, i: _id }) of the last row on the previous page.
// Ordering by (startedAt, _id) means sessions that share a timestamp can't be skipped or repeated.
const encodeCursor = (s: SessionDoc) =>
  Buffer.from(JSON.stringify({ t: s.startedAt.toISOString(), i: s.id })).toString('base64url');

function decodeCursor(cursor: string) {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (raw && typeof raw === 'object' && 't' in raw && 'i' in raw) {
      const { t, i } = raw;
      const date = new Date(String(t));
      if (!Number.isNaN(date.getTime()) && /^[0-9a-f]{24}$/i.test(String(i))) return { t: date, i: String(i) };
    }
  } catch {
    // fall through
  }
  throw new AppError(400, 'Invalid cursor');
}

export async function listSessions(userId: string, query: z.infer<typeof ListSessionsQuerySchema>) {
  const filter: Record<string, unknown> = { userId };
  if (query.cursor) {
    const { t, i } = decodeCursor(query.cursor);
    filter.$or = [{ startedAt: { $lt: t } }, { startedAt: t, _id: { $lt: i } }];
  }
  const docs = await WorkoutSession.find(filter)
    .sort({ startedAt: -1, _id: -1 })
    .limit(query.limit + 1);
  const page = docs.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toDto),
    nextCursor: docs.length > query.limit && last ? encodeCursor(last) : null,
  };
}

// Applies progression to every logged slot and advances nextDay, together with the status change,
// in one transaction: either the session completes and the program moves on, or neither happens.
// `now` is injectable so the seed script can backdate history.
export async function completeSession(userId: string, sessionId: string, now = new Date()) {
  await mongoose.connection.transaction(async (tx) => {
    const session = await WorkoutSession.findOne({ _id: sessionId, userId })
      .session(tx)
      .orFail(new AppError(404, 'Not found'));
    if (session.status !== 'in_progress') throw new AppError(409, 'Session is already completed');
    const program = await ensureProgramState(userId, tx);

    for (const entry of session.entries) {
      const info = SLOT_INDEX.get(entry.slotId);
      const current = program.slots.get(entry.slotId);
      if (info && current) {
        program.slots.set(
          entry.slotId,
          nextState(
            info.slot,
            { weight: current.weight ?? null, target: current.target },
            { weight: entry.weight ?? null, values: [...entry.values] },
          ),
        );
      }
    }
    program.nextDay = (session.day % 7) + 1;
    session.status = 'completed';
    session.completedAt = now;
    await session.save({ session: tx });
    await program.save({ session: tx });
  });
  return getSession(userId, sessionId);
}
