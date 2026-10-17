// api/test/sessions.test.ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { WorkoutSession } from '../src/modules/sessions/session.model';
import { bearer, completeDay, logSets, createUser, startDay } from './helpers';

const app = buildApp();

describe('POST /v1/sessions', () => {
  it('requires a token', async () => {
    await request(app).post('/v1/sessions').send({ day: 1 }).expect(401);
  });

  it('starts a session in progress', async () => {
    const { token } = await createUser('start@test.dev');
    const res = await request(app).post('/v1/sessions').set(bearer(token)).send({ day: 4 }).expect(201);
    expect(res.body).toMatchObject({ day: 4, status: 'in_progress', entries: [], completedAt: null });
  });

  it.each([{ day: 0 }, { day: 8 }, { day: 1.5 }, { day: '1' }, {}, { day: 1, extra: true }])(
    'rejects a bad body %j with 400',
    async (body) => {
      const { token } = await createUser('badstart@test.dev');
      await request(app).post('/v1/sessions').set(bearer(token)).send(body).expect(400);
    },
  );

  it('returns 409 while a session is already in progress', async () => {
    await WorkoutSession.init(); // make sure the partial unique index exists before relying on it
    const { token } = await createUser('twice@test.dev');
    await startDay(app, token, 1);
    await request(app).post('/v1/sessions').set(bearer(token)).send({ day: 2 }).expect(409);
  });

  it('allows a new session once the previous one is completed', async () => {
    await WorkoutSession.init();
    const { token } = await createUser('again@test.dev');
    const first = await startDay(app, token, 6);
    await completeDay(app, token, first).expect(200);
    await startDay(app, token, 7);
  });

  it('lets different users each have one in progress', async () => {
    await WorkoutSession.init();
    const a = await createUser('both-a@test.dev');
    const b = await createUser('both-b@test.dev');
    await startDay(app, a.token, 1);
    await startDay(app, b.token, 1);
  });

  it('lets only one of two simultaneous starts succeed', async () => {
    await WorkoutSession.init();
    const { token } = await createUser('race@test.dev');
    const statuses = (
      await Promise.all([1, 2, 3].map((day) => request(app).post('/v1/sessions').set(bearer(token)).send({ day })))
    )
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([201, 409, 409]);
  });
});

describe('PUT /v1/sessions/:id/entries/:slotId', () => {
  it('logs sets and returns the session', async () => {
    const { token } = await createUser('log@test.dev');
    const id = await startDay(app, token, 4);
    const res = await logSets(app, token, id, 'd4-deadlift', 205, [8, 8, 8]).expect(200);
    expect(res.body.entries).toEqual([{ slotId: 'd4-deadlift', weight: 205, values: [8, 8, 8] }]);
  });

  it('is idempotent: the same PUT twice gives the same session', async () => {
    const { token } = await createUser('idem@test.dev');
    const id = await startDay(app, token, 4);
    const first = await logSets(app, token, id, 'd4-deadlift', 205, [8, 8, 8]).expect(200);
    const second = await logSets(app, token, id, 'd4-deadlift', 205, [8, 8, 8]).expect(200);
    expect(second.body).toEqual(first.body);
    expect(second.body.entries).toHaveLength(1);
  });

  it('replaces an earlier entry for the same slot and keeps the others', async () => {
    const { token } = await createUser('replace@test.dev');
    const id = await startDay(app, token, 4);
    await logSets(app, token, id, 'd4-deadlift', 205, [8, 8, 7]).expect(200);
    await logSets(app, token, id, 'd4-front-squat', 110, [8, 8, 8]).expect(200);
    const res = await logSets(app, token, id, 'd4-deadlift', 205, [8, 8, 8]).expect(200);

    expect(res.body.entries).toHaveLength(2);
    const deadlift = res.body.entries.find((e: { slotId: string }) => e.slotId === 'd4-deadlift');
    expect(deadlift.values).toEqual([8, 8, 8]);
  });

  it('accepts a bodyweight exercise with no weight', async () => {
    const { token } = await createUser('bodyweight@test.dev');
    const id = await startDay(app, token, 1);
    const res = await request(app)
      .put(`/v1/sessions/${id}/entries/d1-lunges`)
      .set(bearer(token))
      .send({ values: [11, 11, 11] })
      .expect(200);
    expect(res.body.entries[0]).toEqual({ slotId: 'd1-lunges', weight: null, values: [11, 11, 11] });
  });

  it('logs a cardio block on a minutes exercise', async () => {
    const { token } = await createUser('cardio@test.dev');
    const id = await startDay(app, token, 1);
    const res = await request(app)
      .put(`/v1/sessions/${id}/entries/d1-walk`)
      .set(bearer(token))
      .send({ cardio: { minutes: 22, speedMph: 2.2, inclinePct: 9 } })
      .expect(200);
    expect(res.body.entries[0]).toEqual({
      slotId: 'd1-walk',
      weight: null,
      values: [],
      cardio: { minutes: 22, speedMph: 2.2, inclinePct: 9 },
    });
  });

  it('rejects an exercise that belongs to a different day', async () => {
    const { token } = await createUser('wrongday@test.dev');
    const id = await startDay(app, token, 1);
    await logSets(app, token, id, 'd4-deadlift', 205, [8, 8, 8]).expect(400);
  });

  it('rejects an unknown exercise', async () => {
    const { token } = await createUser('unknownslot@test.dev');
    const id = await startDay(app, token, 1);
    await logSets(app, token, id, 'd1-nope', 100, [8]).expect(400);
  });

  it('rejects more sets than prescribed', async () => {
    const { token } = await createUser('toomany@test.dev');
    const id = await startDay(app, token, 4);
    await logSets(app, token, id, 'd4-deadlift', 205, [8, 8, 8, 8]).expect(400);
  });

  it('rejects cardio details on a reps exercise and reps on a cardio exercise', async () => {
    const { token } = await createUser('mismatch@test.dev');
    const id = await startDay(app, token, 1);
    await request(app)
      .put(`/v1/sessions/${id}/entries/d1-squat`)
      .set(bearer(token))
      .send({ cardio: { minutes: 10 } })
      .expect(400);
    await logSets(app, token, id, 'd1-walk', null, [20]).expect(400);
  });

  it.each([
    { name: 'negative reps', body: { weight: 100, values: [-1] } },
    { name: 'negative weight', body: { weight: -5, values: [8] } },
    { name: 'no sets', body: { weight: 100, values: [] } },
    { name: 'non-numeric reps', body: { weight: 100, values: ['8'] } },
    { name: 'unknown field', body: { weight: 100, values: [8], userId: 'x' } },
    { name: 'empty body', body: {} },
  ])('rejects $name with 400', async ({ body }) => {
    const { token } = await createUser('badentry@test.dev');
    const id = await startDay(app, token, 4);
    await request(app).put(`/v1/sessions/${id}/entries/d4-deadlift`).set(bearer(token)).send(body).expect(400);
  });

  it('returns 400 for a malformed session id and 404 for one that does not exist', async () => {
    const { token } = await createUser('badid@test.dev');
    await logSets(app, token, 'not-an-id', 'd4-deadlift', 205, [8]).expect(400);
    await logSets(app, token, 'f'.repeat(24), 'd4-deadlift', 205, [8]).expect(404);
  });

  it('returns 409 once the session is completed', async () => {
    const { token } = await createUser('late@test.dev');
    const id = await startDay(app, token, 4);
    await completeDay(app, token, id).expect(200);
    await logSets(app, token, id, 'd4-deadlift', 205, [8, 8, 8]).expect(409);
  });
});

describe('GET /v1/sessions/:id', () => {
  it('returns your session', async () => {
    const { token } = await createUser('getone@test.dev');
    const id = await startDay(app, token, 2);
    const res = await request(app).get(`/v1/sessions/${id}`).set(bearer(token)).expect(200);
    expect(res.body).toMatchObject({ id, day: 2, status: 'in_progress' });
  });

  it('returns 404 for an id that does not exist and 400 for a malformed one', async () => {
    const { token } = await createUser('getnone@test.dev');
    await request(app)
      .get(`/v1/sessions/${'a'.repeat(24)}`)
      .set(bearer(token))
      .expect(404);
    await request(app).get('/v1/sessions/nope').set(bearer(token)).expect(400);
  });
});

describe('GET /v1/sessions', () => {
  async function seedCompleted(userId: string, count: number, startedAt: (i: number) => Date) {
    // Completed rows: the one-in-progress index only constrains in_progress sessions.
    return WorkoutSession.insertMany(
      Array.from({ length: count }, (_, i) => ({
        userId,
        day: (i % 7) + 1,
        status: 'completed',
        startedAt: startedAt(i),
        completedAt: startedAt(i),
      })),
    );
  }

  it('returns newest first', async () => {
    const { token, userId } = await createUser('order@test.dev');
    await seedCompleted(userId, 3, (i) => new Date(Date.UTC(2026, 0, 1 + i)));
    const res = await request(app).get('/v1/sessions').set(bearer(token)).expect(200);
    const dates = res.body.items.map((s: { startedAt: string }) => s.startedAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(res.body.nextCursor).toBeNull();
  });

  it('pages without skipping or repeating, even when timestamps are identical', async () => {
    const { token, userId } = await createUser('paging@test.dev');
    const same = new Date(Date.UTC(2026, 0, 1));
    const created = await seedCompleted(userId, 5, () => same);

    const seen: string[] = [];
    let cursor: string | null = null;
    const pageSizes: number[] = [];
    do {
      const url: string = `/v1/sessions?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await request(app).get(url).set(bearer(token)).expect(200);
      pageSizes.push(res.body.items.length);
      seen.push(...res.body.items.map((s: { id: string }) => s.id));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(pageSizes).toEqual([2, 2, 1]);
    expect(new Set(seen).size).toBe(5);
    expect([...seen].sort()).toEqual(created.map((s) => s.id).sort());
  });

  it('only lists your own sessions', async () => {
    const a = await createUser('list-a@test.dev');
    const b = await createUser('list-b@test.dev');
    await seedCompleted(a.userId, 2, (i) => new Date(Date.UTC(2026, 0, 1 + i)));
    const res = await request(app).get('/v1/sessions').set(bearer(b.token)).expect(200);
    expect(res.body.items).toEqual([]);
  });

  it.each(['limit=0', 'limit=101', 'limit=abc', 'cursor=not-a-cursor', 'unknown=1'])(
    'rejects ?%s with 400',
    async (query) => {
      const { token } = await createUser('badquery@test.dev');
      await request(app).get(`/v1/sessions?${query}`).set(bearer(token)).expect(400);
    },
  );
});
