// api/src/scripts/seed.ts
// `npm run seed`: creates a demo user and replays ~8 weeks of plausible training through the real
// service functions (the same ones the HTTP routes call), including a few misses and a few short
// sessions. Because it goes through the real progression engine, it doubles as a smoke test, and
// anyone trying the app sees real history and charts.
import mongoose from 'mongoose';
import { env } from '../config/env';
import { signUp } from '../modules/auth/auth.service';
import { User } from '../modules/auth/user.model';
import { ensureProgramState } from '../modules/program/program.service';
import { completeSession, logEntry, startSession } from '../modules/sessions/sessions.service';
import { PROGRAM } from '../program/program';

export const DEMO_EMAIL = 'demo@dougfitness.dev';
export const DEMO_PASSWORD = 'demo-password-123';

const DAY_MS = 24 * 60 * 60 * 1000;

// An allow-list, not a deny-list: only a database whose name says dev or test can be seeded. A deny-list of
// "the production name" fails the day someone names prod differently (here: dev is DougFitness-Dev, prod is
// DougFitness).
export function assertSafeDatabase(dbName: string) {
  if (!/dev|test/i.test(dbName)) {
    throw new Error(`Refusing to seed "${dbName}": only databases with "dev" or "test" in the name are seeded`);
  }
}

// Deterministic, so the seeded history is the same every time:
//  - a miss: the last set falls one short of the target (the lift repeats next week)
//  - a short session: the last set is skipped (fewer sets than prescribed also counts as a miss)
const isMiss = (week: number, slotNumber: number) => (week + slotNumber) % 4 === 3;
const isShort = (week: number, slotNumber: number) => (week * 5 + slotNumber) % 13 === 12;

export async function seedDemo({ weeks = 8, now = new Date() }: { weeks?: number; now?: Date } = {}) {
  if (await User.exists({ email: DEMO_EMAIL })) return { created: false as const };

  const { user } = await signUp({ email: DEMO_EMAIL, password: DEMO_PASSWORD, displayName: 'Demo Lifter' });
  const userId = user.id;
  const slotNumber = new Map(PROGRAM.flatMap((d) => d.slots).map((s, i) => [s.id, i]));
  const firstDay = now.getTime() - weeks * 7 * DAY_MS;

  for (let i = 0; i < weeks * 7; i++) {
    const week = Math.floor(i / 7);
    const day = PROGRAM.find((d) => d.day === (i % 7) + 1);
    if (!day) throw new Error('program is missing a day');
    const date = new Date(firstDay + i * DAY_MS);

    const session = await startSession(userId, day.day, date);
    const state = await ensureProgramState(userId);
    for (const slot of day.slots) {
      const current = state.slots.get(slot.id) ?? slot.start;
      const n = slotNumber.get(slot.id) ?? 0;
      if (slot.unit === 'minutes') {
        await logEntry(userId, session.id, slot.id, {
          cardio: { minutes: current.target, speedMph: 2.2, inclinePct: 9 },
        });
        continue;
      }
      let values = Array.from({ length: slot.sets }, () => current.target);
      if (isMiss(week, n)) values = values.map((v, k) => (k === values.length - 1 ? v - 1 : v));
      else if (isShort(week, n)) values = values.slice(0, -1);
      if (values.length === 0) continue;
      await logEntry(userId, session.id, slot.id, { weight: current.weight ?? null, values });
    }
    await completeSession(userId, session.id, new Date(date.getTime() + 60 * 60 * 1000));
  }
  return { created: true as const, userId, sessions: weeks * 7 };
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed with NODE_ENV=production');
  const config = env();
  await mongoose.connect(config.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  try {
    const dbName = mongoose.connection.name;
    assertSafeDatabase(dbName);
    console.log(`Seeding database "${dbName}"...`);
    const result = await seedDemo();
    if (result.created) {
      console.log(`Created ${DEMO_EMAIL} with ${result.sessions} completed sessions. Password: ${DEMO_PASSWORD}`);
    } else {
      console.log(`${DEMO_EMAIL} already exists; nothing to do.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
