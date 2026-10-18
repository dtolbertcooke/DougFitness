// api/test/seed.test.ts
// The seed replays history through the real engine, so these double as an end-to-end progression check.
import { describe, expect, it } from 'vitest';
import { User } from '../src/modules/auth/user.model';
import { ProgramState } from '../src/modules/program/programState.model';
import { slotProgress } from '../src/modules/progress/progress.service';
import { WorkoutSession } from '../src/modules/sessions/session.model';
import { DEMO_EMAIL, assertSafeDatabase, seedDemo } from '../src/scripts/seed';
import { slotOf } from './helpers';

const NOW = new Date('2026-06-01T12:00:00Z');
const REPLAY_TIMEOUT = 60_000; // 56 sessions = 56 transactions plus ~400 writes

describe('assertSafeDatabase', () => {
  it.each(['DougFitness-Dev', 'liftlog_dev', 'dougfitness_test', 'test'])('allows %s', (name) => {
    expect(() => assertSafeDatabase(name)).not.toThrow();
  });

  it.each(['DougFitness', 'liftlog', 'production', 'admin', ''])('refuses %j', (name) => {
    expect(() => assertSafeDatabase(name)).toThrow(/Refusing to seed/);
  });
});

describe('seedDemo', () => {
  it(
    'creates eight weeks of completed history and leaves the program ready for Day 1',
    async () => {
      const result = await seedDemo({ weeks: 8, now: NOW });
      expect(result).toMatchObject({ created: true, sessions: 56 });

      const user = await User.findOne({ email: DEMO_EMAIL }).orFail();
      expect(await WorkoutSession.countDocuments({ userId: user.id, status: 'completed' })).toBe(56);
      expect(await WorkoutSession.countDocuments({ userId: user.id, status: 'in_progress' })).toBe(0);
      expect((await ProgramState.findOne({ userId: user.id }).orFail()).nextDay).toBe(1);

      const first = await WorkoutSession.findOne({ userId: user.id }).sort({ startedAt: 1 }).orFail();
      expect(first.startedAt.getTime()).toBe(NOW.getTime() - 56 * 24 * 60 * 60 * 1000);
    },
    REPLAY_TIMEOUT,
  );

  it(
    'produces a squat history that climbs, with at least one repeated weight (a miss)',
    async () => {
      await seedDemo({ weeks: 8, now: NOW });
      const user = await User.findOne({ email: DEMO_EMAIL }).orFail();
      const squat = slotOf('d1-squat');

      const series = await slotProgress(user.id, squat.id);
      const weights = series.map((p) => p.weight ?? 0);
      expect(weights).toHaveLength(8);
      expect(weights[0]).toBe(squat.start.weight);
      expect(weights).toEqual([...weights].sort((a, b) => a - b)); // never goes down
      expect(weights.at(-1)).toBeGreaterThan(weights[0] ?? Infinity);
      expect(new Set(weights).size).toBeLessThan(weights.length); // a repeat = a miss
    },
    REPLAY_TIMEOUT,
  );

  it(
    'is idempotent',
    async () => {
      await seedDemo({ weeks: 2, now: NOW });
      const again = await seedDemo({ weeks: 2, now: NOW });
      expect(again.created).toBe(false);
      expect(await WorkoutSession.countDocuments({})).toBe(14);
      expect(await User.countDocuments({ email: DEMO_EMAIL })).toBe(1);
    },
    REPLAY_TIMEOUT,
  );
});
