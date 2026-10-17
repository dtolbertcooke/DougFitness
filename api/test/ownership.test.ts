// api/test/ownership.test.ts
// The IDOR guard (OWASP API #1): v0 let any signed-in user read or change any other user's data.
// Another user's session must look exactly like a session that doesn't exist: 404, never 403.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { WorkoutSession } from '../src/modules/sessions/session.model';
import { bearer, logSets, createUser, startDay } from './helpers';

const app = buildApp();

describe("user B and user A's session", () => {
  it('cannot read it', async () => {
    const a = await createUser('a@test.dev');
    const b = await createUser('b@test.dev');
    const id = await startDay(app, a.token, 1);

    await request(app).get(`/v1/sessions/${id}`).set(bearer(b.token)).expect(404);
  });

  it('cannot log to it, and cannot tell it exists', async () => {
    const a = await createUser('a2@test.dev');
    const b = await createUser('b2@test.dev');
    const id = await startDay(app, a.token, 1);

    const res = await logSets(app, b.token, id, 'd1-squat', 170, [8, 8, 8]).expect(404);
    const missing = await logSets(app, b.token, '0'.repeat(24), 'd1-squat', 170, [8, 8, 8]).expect(404);
    expect(res.body).toEqual(missing.body); // identical to a session that doesn't exist

    const stored = await WorkoutSession.findById(id).orFail();
    expect(stored.entries).toHaveLength(0);
  });

  it('cannot complete it', async () => {
    const a = await createUser('a3@test.dev');
    const b = await createUser('b3@test.dev');
    const id = await startDay(app, a.token, 1);

    await request(app).post(`/v1/sessions/${id}/complete`).set(bearer(b.token)).expect(404);

    const stored = await WorkoutSession.findById(id).orFail();
    expect(stored.status).toBe('in_progress');
  });

  it('does not see it in their history', async () => {
    const a = await createUser('a4@test.dev');
    const b = await createUser('b4@test.dev');
    await startDay(app, a.token, 1);

    const res = await request(app).get('/v1/sessions').set(bearer(b.token)).expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('cannot be given an owner by the client: userId in the body is rejected', async () => {
    const a = await createUser('a5@test.dev');
    const b = await createUser('b5@test.dev');

    await request(app).post('/v1/sessions').set(bearer(b.token)).send({ day: 1, userId: a.userId }).expect(400);
  });
});
