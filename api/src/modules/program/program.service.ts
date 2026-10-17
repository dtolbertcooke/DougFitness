// api/src/modules/program/program.service.ts
import type { ClientSession } from 'mongoose';
import { PROGRAM } from '../../program/program';
import { initialSlotStates } from '../../program/slots';
import { ProgramState } from './programState.model';

function isDuplicateKey(err: unknown) {
  return !!err && typeof err === 'object' && 'code' in err && err.code === 11000;
}

// Idempotent: returns the user's program state, creating it from the program's start values if it
// doesn't exist yet. Sign-up calls it, and so does every read, so a missing state can never 500.
export async function ensureProgramState(userId: string, tx?: ClientSession) {
  const find = () => ProgramState.findOne({ userId }).session(tx ?? null);
  const existing = await find();
  if (existing) return existing;
  try {
    return await ProgramState.findOneAndUpdate(
      { userId },
      { $setOnInsert: { nextDay: 1, slots: initialSlotStates() } },
      { upsert: true, returnDocument: 'after', session: tx ?? null },
    ).orFail();
  } catch (err) {
    // Two requests created it at once; the unique index let one win. Read the winner's document.
    if (isDuplicateKey(err)) return find().orFail();
    throw err;
  }
}

export async function getProgram(userId: string) {
  const state = await ensureProgramState(userId);
  return {
    nextDay: state.nextDay,
    days: PROGRAM.map((d) => ({
      day: d.day,
      name: d.name,
      slots: d.slots.map((slot) => ({ ...slot, current: state.slots.get(slot.id) ?? slot.start })),
    })),
  };
}
