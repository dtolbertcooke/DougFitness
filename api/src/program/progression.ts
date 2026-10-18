// api/src/program/progression.ts
// The progression rules. Pure: inputs in, outputs out. No database, no Express, no dates.
export type Unit = 'reps' | 'seconds' | 'minutes';

export type Rule =
  | { kind: 'linear'; increment: number } // main lifts: add weight each week
  | { kind: 'double'; weightStep: number | null } // reps first, then weight (null: no load to add)
  | { kind: 'progressive'; step: number } // bodyweight or timed: add reps or seconds
  | { kind: 'none' }; // cardio: log only

export interface SlotState {
  weight: number | null;
  target: number;
}

export interface Slot {
  id: string;
  exercise: string;
  unit: Unit;
  sets: number;
  range: [min: number, max: number];
  rule: Rule;
  start: SlotState;
  perSide?: boolean;
  rest?: 'short';
  notes?: string;
}

export interface Day {
  day: number;
  name: string;
  slots: Slot[];
}

// What was actually done: the weight used and one value (reps or seconds) per set.
export interface Performed {
  weight: number | null;
  values: number[];
}

export function nextState(slot: Slot, state: SlotState, done: Performed): SlotState {
  const [min, max] = slot.range;
  const allSets = done.values.length >= slot.sets;
  const hitAll = (bar: number) => allSets && done.values.every((v) => v >= bar);
  const hold = { weight: done.weight, target: state.target };
  const rule = slot.rule;

  switch (rule.kind) {
    case 'linear':
      return hitAll(min) && done.weight !== null
        ? { weight: done.weight + rule.increment, target: state.target }
        : hold;
    case 'double':
      if (!hitAll(state.target)) return hold;
      if (state.target < max) return { weight: done.weight, target: state.target + 1 };
      if (rule.weightStep !== null && done.weight !== null) {
        return { weight: done.weight + rule.weightStep, target: min };
      }
      return { weight: done.weight, target: max }; // nothing to add yet: stay at the top
    case 'progressive':
      return {
        weight: done.weight,
        target: hitAll(state.target) ? state.target + rule.step : state.target,
      };
    case 'none':
      return state;
  }
}
