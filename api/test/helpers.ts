// api/test/helpers.ts
import request from 'supertest';
import type { Express } from 'express';
import { signToken } from '../src/modules/auth/token';
import { User } from '../src/modules/auth/user.model';
import { ensureProgramState } from '../src/modules/program/program.service';
import { nextState } from '../src/program/progression';
import { SLOT_INDEX } from '../src/program/slots';

export async function signUp(app: Express, email: string, password = 'correct horse battery staple') {
  const res = await request(app)
    .post('/v1/auth/signup')
    .send({ email, password, displayName: 'Test User' })
    .expect(201);
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

// A user and token created directly, bypassing POST /v1/auth/signup. The auth routes are rate limited
// (20 per 15 minutes), and tests that just need a signed-in user shouldn't spend that budget or pay
// for an argon2 hash. Use signUp when sign-up itself is what's being tested.
export async function createUser(email: string) {
  const user = await User.create({ email, passwordHash: 'not-a-real-hash', displayName: 'Test User' });
  await ensureProgramState(user.id);
  return { token: signToken(user.id), userId: user.id };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Starts a session for `day` and returns its id.
export async function startDay(app: Express, token: string, day: number) {
  const res = await request(app).post('/v1/sessions').set(bearer(token)).send({ day }).expect(201);
  return res.body.id as string;
}

// Logs one reps/seconds exercise.
export function logSets(
  app: Express,
  token: string,
  sessionId: string,
  slotId: string,
  weight: number | null,
  values: number[],
) {
  return request(app).put(`/v1/sessions/${sessionId}/entries/${slotId}`).set(bearer(token)).send({ weight, values });
}

export function completeDay(app: Express, token: string, sessionId: string) {
  return request(app).post(`/v1/sessions/${sessionId}/complete`).set(bearer(token));
}

export async function getProgram(app: Express, token: string) {
  const res = await request(app).get('/v1/program').set(bearer(token)).expect(200);
  return res.body as {
    nextDay: number;
    days: { day: number; slots: { id: string; current: { weight: number | null; target: number } }[] }[];
  };
}

// The current { weight, target } for one slot, read through the API.
export async function currentOf(app: Express, token: string, slotId: string) {
  const program = await getProgram(app, token);
  return program.days.flatMap((d) => d.slots).find((s) => s.id === slotId)?.current;
}

// Program numbers live in PROGRAM and get tuned over time, so API tests read them from there instead of
// hard-coding weights. The rules themselves are pinned with literal numbers in progression.test.ts.
export function slotOf(slotId: string) {
  const info = SLOT_INDEX.get(slotId);
  if (!info) throw new Error(`unknown slot ${slotId}`);
  return info.slot;
}

// Every set logged at the slot's starting target: a successful session.
export function perfectSets(slotId: string) {
  const slot = slotOf(slotId);
  return Array.from({ length: slot.sets }, () => slot.start.target);
}

// What the slot's state should be after one session, starting from the program's start values.
export function expectedAfter(slotId: string, values: number[]) {
  const slot = slotOf(slotId);
  return nextState(slot, slot.start, { weight: slot.start.weight, values });
}
