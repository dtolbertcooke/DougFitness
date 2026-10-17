// api/src/program/slots.ts
// Lookups derived from PROGRAM, built once at import time. Pure, no I/O.
import { PROGRAM } from './program';
import type { Slot, SlotState } from './progression';

export interface SlotInfo {
  slot: Slot;
  day: number;
}

// slot id -> the slot and the day it belongs to
export const SLOT_INDEX: ReadonlyMap<string, SlotInfo> = new Map(
  PROGRAM.flatMap((d) => d.slots.map((slot) => [slot.id, { slot, day: d.day }] as const)),
);

// Every slot's starting weight/target: the state a new account begins with.
export const initialSlotStates = (): Record<string, SlotState> =>
  Object.fromEntries(PROGRAM.flatMap((d) => d.slots).map((s) => [s.id, { ...s.start }]));
