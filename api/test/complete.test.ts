// api/test/complete.test.ts
// Completing a session applies progression and advances the program in one transaction.
// Expected numbers come from PROGRAM via the helpers (see slotOf), not from literals.
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { ProgramState } from '../src/modules/program/programState.model';
import { WorkoutSession } from '../src/modules/sessions/session.model';
import { completeSession, logEntry, startSession } from '../src/modules/sessions/sessions.service';
import {
  bearer,
  completeDay,
  createUser,
  currentOf,
  expectedAfter,
  getProgram,
  logSets,
  perfectSets,
  slotOf,
  startDay,
} from './helpers';

const app = buildApp();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /v1/sessions/:id/complete', () => {
  it('raises a main lift when every set hits the bottom of the range, and advances the day', async () => {
    const { token } = await createUser('c-linear@test.dev');
    const deadlift = slotOf('d4-deadlift');
    const id = await startDay(app, token, 4);
    await logSets(app, token, id, deadlift.id, deadlift.start.weight, perfectSets(deadlift.id)).expect(200);

    const res = await completeDay(app, token, id).expect(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.completedAt).toEqual(expect.any(String));

    const after = await currentOf(app, token, deadlift.id);
    expect(after).toEqual(expectedAfter(deadlift.id, perfectSets(deadlift.id)));
    expect(after?.weight).toBeGreaterThan(deadlift.start.weight ?? Infinity); // it actually moved up
    expect((await getProgram(app, token)).nextDay).toBe(5);
  });

  it('repeats the weight after a miss', async () => {
    const { token } = await createUser('c-miss@test.dev');
    const deadlift = slotOf('d4-deadlift');
    const missed = perfectSets(deadlift.id).map((v, i, all) => (i === all.length - 1 ? v - 1 : v));
    const id = await startDay(app, token, 4);
    await logSets(app, token, id, deadlift.id, deadlift.start.weight, missed).expect(200);
    await completeDay(app, token, id).expect(200);

    expect(await currentOf(app, token, deadlift.id)).toEqual(deadlift.start);
  });

  it('advances a reps-then-weight lift by the engine rule', async () => {
    const { token } = await createUser('c-double@test.dev');
    const pushdown = slotOf('d2-pushdown');
    const id = await startDay(app, token, 2);
    await logSets(app, token, id, pushdown.id, pushdown.start.weight, perfectSets(pushdown.id)).expect(200);
    await completeDay(app, token, id).expect(200);

    const after = await currentOf(app, token, pushdown.id);
    expect(after).toEqual(expectedAfter(pushdown.id, perfectSets(pushdown.id)));
    expect(after).not.toEqual(pushdown.start); // success changes something: a rep or the weight
  });

  it('leaves exercises that were never logged unchanged', async () => {
    const { token } = await createUser('c-skip@test.dev');
    const bench = slotOf('d2-bench');
    const ohp = slotOf('d2-ohp');
    const id = await startDay(app, token, 2);
    await logSets(app, token, id, bench.id, bench.start.weight, perfectSets(bench.id)).expect(200);
    await completeDay(app, token, id).expect(200);

    expect(await currentOf(app, token, bench.id)).toEqual(expectedAfter(bench.id, perfectSets(bench.id)));
    expect(await currentOf(app, token, ohp.id)).toEqual(ohp.start);
  });

  it('logs cardio without changing any target', async () => {
    const { token } = await createUser('c-cardio@test.dev');
    const walk = slotOf('d3-walk');
    const id = await startDay(app, token, 3);
    await request(app)
      .put(`/v1/sessions/${id}/entries/${walk.id}`)
      .set(bearer(token))
      .send({ cardio: { minutes: walk.start.target } })
      .expect(200);
    await completeDay(app, token, id).expect(200);

    expect(await currentOf(app, token, walk.id)).toEqual(walk.start);
  });

  it('completes a rest day with no entries and moves on to Day 7', async () => {
    const { token } = await createUser('c-rest@test.dev');
    const id = await startDay(app, token, 6);
    await completeDay(app, token, id).expect(200);
    expect((await getProgram(app, token)).nextDay).toBe(7);
  });

  it('wraps from Day 7 back to Day 1', async () => {
    const { token } = await createUser('c-wrap@test.dev');
    const id = await startDay(app, token, 7);
    await completeDay(app, token, id).expect(200);
    expect((await getProgram(app, token)).nextDay).toBe(1);
  });

  it('returns 409 when completed twice, and the second call changes nothing', async () => {
    const { token } = await createUser('c-twice@test.dev');
    const deadlift = slotOf('d4-deadlift');
    const id = await startDay(app, token, 4);
    await logSets(app, token, id, deadlift.id, deadlift.start.weight, perfectSets(deadlift.id)).expect(200);
    await completeDay(app, token, id).expect(200);
    await completeDay(app, token, id).expect(409);

    expect(await currentOf(app, token, deadlift.id)).toEqual(expectedAfter(deadlift.id, perfectSets(deadlift.id)));
  });

  it('returns 404 for a session that does not exist and 400 for a malformed id', async () => {
    const { token } = await createUser('c-none@test.dev');
    await request(app)
      .post(`/v1/sessions/${'b'.repeat(24)}/complete`)
      .set(bearer(token))
      .expect(404);
    await request(app).post('/v1/sessions/nope/complete').set(bearer(token)).expect(400);
  });

  it('rolls everything back when saving the program state fails', async () => {
    const { token, userId } = await createUser('c-rollback@test.dev');
    const deadlift = slotOf('d4-deadlift');
    const id = await startDay(app, token, 4);
    await logSets(app, token, id, deadlift.id, deadlift.start.weight, perfectSets(deadlift.id)).expect(200);

    vi.spyOn(ProgramState.prototype, 'save').mockRejectedValueOnce(new Error('simulated failure'));
    await completeDay(app, token, id).expect(500);

    // The session was saved first inside the transaction, so this proves the abort undid it.
    const session = await WorkoutSession.findById(id).orFail();
    expect(session.status).toBe('in_progress');
    expect(session.completedAt).toBeFalsy();
    const state = await ProgramState.findOne({ userId }).orFail();
    expect(state.nextDay).toBe(1);
    expect(state.slots.get(deadlift.id)?.weight).toBe(deadlift.start.weight);
  });

  it('lets only one of two simultaneous completions apply progression', async () => {
    const { token } = await createUser('c-race@test.dev');
    const deadlift = slotOf('d4-deadlift');
    const id = await startDay(app, token, 4);
    await logSets(app, token, id, deadlift.id, deadlift.start.weight, perfectSets(deadlift.id)).expect(200);

    const statuses = (await Promise.all([completeDay(app, token, id), completeDay(app, token, id)]))
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([200, 409]);
    // Progression applied once, not twice
    expect(await currentOf(app, token, deadlift.id)).toEqual(expectedAfter(deadlift.id, perfectSets(deadlift.id)));
  });
});

describe('a full week through the API', () => {
  it('carries a main lift forward week over week', async () => {
    const { token } = await createUser('week@test.dev');
    const squat = slotOf('d1-squat');
    if (squat.rule.kind !== 'linear' || squat.start.weight === null) throw new Error('expected a linear squat');
    const weeks = 2;

    for (let week = 0; week < weeks; week++) {
      for (let day = 1; day <= 7; day++) {
        const id = await startDay(app, token, day);
        if (day === 1) {
          const current = await currentOf(app, token, squat.id);
          expect(current?.weight).toBe(squat.start.weight + week * squat.rule.increment);
          await logSets(app, token, id, squat.id, current?.weight ?? null, perfectSets(squat.id)).expect(200);
        }
        await completeDay(app, token, id).expect(200);
      }
    }
    expect((await getProgram(app, token)).nextDay).toBe(1);
    expect((await currentOf(app, token, squat.id))?.weight).toBe(squat.start.weight + weeks * squat.rule.increment);
  });
});

describe('GET /v1/progress/:slotId', () => {
  it('requires a token', async () => {
    await request(app).get('/v1/progress/d1-squat').expect(401);
  });

  it('returns one point per completed session, oldest first, ignoring unfinished sessions', async () => {
    const { token, userId } = await createUser('progress@test.dev');
    const dates = [new Date('2026-03-02T18:00:00Z'), new Date('2026-03-09T18:00:00Z')];
    for (const [i, date] of dates.entries()) {
      const session = await startSession(userId, 1, date);
      await logEntry(userId, session.id, 'd1-squat', { weight: 100 + i * 10, values: [8, 9, 10] });
      await completeSession(userId, session.id, date);
    }
    // In progress: must not appear
    const open = await startSession(userId, 1, new Date('2026-03-16T18:00:00Z'));
    await logEntry(userId, open.id, 'd1-squat', { weight: 999, values: [8, 8, 8] });

    const res = await request(app).get('/v1/progress/d1-squat').set(bearer(token)).expect(200);
    expect(res.body).toEqual([
      { date: dates[0]?.toISOString(), weight: 100, best: 10 },
      { date: dates[1]?.toISOString(), weight: 110, best: 10 },
    ]);
  });

  it('is empty for a slot you have not logged and never includes other users', async () => {
    const a = await createUser('progress-a@test.dev');
    const b = await createUser('progress-b@test.dev');
    const deadlift = slotOf('d4-deadlift');
    const id = await startDay(app, a.token, 4);
    await logSets(app, a.token, id, deadlift.id, deadlift.start.weight, perfectSets(deadlift.id)).expect(200);
    await completeDay(app, a.token, id).expect(200);

    const mine = await request(app).get(`/v1/progress/${deadlift.id}`).set(bearer(a.token)).expect(200);
    expect(mine.body).toHaveLength(1);
    const theirs = await request(app).get(`/v1/progress/${deadlift.id}`).set(bearer(b.token)).expect(200);
    expect(theirs.body).toEqual([]);
    const unlogged = await request(app).get('/v1/progress/d1-squat').set(bearer(a.token)).expect(200);
    expect(unlogged.body).toEqual([]);
  });

  it('returns 404 for a slot that is not in the program', async () => {
    const { token } = await createUser('progress-404@test.dev');
    await request(app).get('/v1/progress/d9-nothing').set(bearer(token)).expect(404);
  });
});
