// api/test/program.api.test.ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { ProgramState } from '../src/modules/program/programState.model';
import { WorkoutSession } from '../src/modules/sessions/session.model';
import { PROGRAM } from '../src/program/program';
import { bearer, completeDay, getProgram, logSets, perfectSets, signUp, slotOf, startDay } from './helpers';

const app = buildApp();
const TOTAL_SLOTS = PROGRAM.flatMap((d) => d.slots).length;

describe('GET /v1/program', () => {
  it('requires a token', async () => {
    await request(app).get('/v1/program').expect(401);
  });

  it('returns all seven days with start values and nextDay 1 for a new account', async () => {
    const { token } = await signUp(app, 'program@test.dev');
    const program = await getProgram(app, token);

    expect(program.nextDay).toBe(1);
    expect(program.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(program.days.find((d) => d.day === 6)?.slots).toEqual([]);
    const deadlift = program.days.flatMap((d) => d.slots).find((s) => s.id === 'd4-deadlift');
    expect(deadlift?.current).toEqual(slotOf('d4-deadlift').start);
  });

  it('seeds the program state at sign-up', async () => {
    const { userId } = await signUp(app, 'seeded@test.dev');
    const state = await ProgramState.findOne({ userId }).orFail();
    expect(state.slots.size).toBe(TOTAL_SLOTS);
    expect(state.nextDay).toBe(1);
  });

  it('recreates a missing program state instead of failing', async () => {
    const { token, userId } = await signUp(app, 'missing-state@test.dev');
    await ProgramState.deleteOne({ userId });

    const program = await getProgram(app, token);
    expect(program.nextDay).toBe(1);
    expect(await ProgramState.countDocuments({ userId })).toBe(1);
  });

  it("does not show one user another user's progress", async () => {
    const a = await signUp(app, 'prog-a@test.dev');
    const b = await signUp(app, 'prog-b@test.dev');
    const id = await startDay(app, a.token, 4);
    await logSets(
      app,
      a.token,
      id,
      'd4-deadlift',
      slotOf('d4-deadlift').start.weight,
      perfectSets('d4-deadlift'),
    ).expect(200);
    await completeDay(app, a.token, id).expect(200);

    const bProgram = await getProgram(app, b.token);
    expect(bProgram.nextDay).toBe(1);
    expect(bProgram.days.flatMap((d) => d.slots).find((s) => s.id === 'd4-deadlift')?.current).toEqual(
      slotOf('d4-deadlift').start,
    );
  });
});

describe('DELETE /v1/me cascade', () => {
  it("removes the user's sessions and program state, and only theirs", async () => {
    const a = await signUp(app, 'cascade-a@test.dev');
    const b = await signUp(app, 'cascade-b@test.dev');
    await startDay(app, a.token, 1);
    await startDay(app, b.token, 1);

    await request(app).delete('/v1/me').set(bearer(a.token)).expect(204);

    expect(await WorkoutSession.countDocuments({ userId: a.userId })).toBe(0);
    expect(await ProgramState.countDocuments({ userId: a.userId })).toBe(0);
    expect(await WorkoutSession.countDocuments({ userId: b.userId })).toBe(1);
    expect(await ProgramState.countDocuments({ userId: b.userId })).toBe(1);
  });
});
