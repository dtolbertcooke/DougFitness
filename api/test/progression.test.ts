// api/test/progression.test.ts
// Decision table for nextState (see docs/BUILD_PLAN.md, "Test design"). Every row is one cell of the
// rules table or one boundary derived from it. Progression rules change only with a matching row here.
import { describe, expect, it } from 'vitest';
import { nextState, type Slot } from '../src/program/progression';

const deadlift: Slot = {
  id: 'd4-deadlift',
  exercise: 'Deadlift',
  unit: 'reps',
  sets: 3,
  range: [8, 8],
  rule: { kind: 'linear', increment: 10 },
  start: { weight: 205, target: 8 },
};
const frontSquat: Slot = {
  ...deadlift,
  id: 'd4-front-squat',
  range: [8, 10],
  rule: { kind: 'linear', increment: 5 },
};
const pushdown: Slot = {
  id: 'd2-pushdown',
  exercise: 'Tricep pushdowns',
  unit: 'reps',
  sets: 3,
  range: [10, 12],
  rule: { kind: 'double', weightStep: 5 },
  start: { weight: 100, target: 12 },
};
const lunges: Slot = {
  ...pushdown,
  id: 'd1-lunges',
  rule: { kind: 'double', weightStep: null },
};
const pallof: Slot = {
  id: 'd1-pallof',
  exercise: 'Pallof press',
  unit: 'reps',
  sets: 3,
  range: [12, 12],
  perSide: true,
  rule: { kind: 'double', weightStep: 2.5 },
  start: { weight: 30, target: 12 },
};
const legRaises: Slot = {
  id: 'd2-leg-raise',
  exercise: 'Lying leg raises',
  unit: 'reps',
  sets: 3,
  range: [10, 10],
  rule: { kind: 'progressive', step: 1 },
  start: { weight: null, target: 10 },
};
const plank: Slot = {
  id: 'd1-plank',
  exercise: 'Plank',
  unit: 'seconds',
  sets: 3,
  range: [30, 30],
  rule: { kind: 'progressive', step: 2 },
  start: { weight: null, target: 30 },
};
const walk: Slot = {
  id: 'd1-walk',
  exercise: 'Incline walk',
  unit: 'minutes',
  sets: 1,
  range: [20, 25],
  rule: { kind: 'none' },
  start: { weight: null, target: 20 },
};

describe('nextState', () => {
  it.each([
    // linear: main lifts
    {
      name: 'linear: every set at the bottom of the range: +10',
      slot: deadlift,
      state: { weight: 205, target: 8 },
      done: { weight: 205, values: [8, 8, 8] },
      next: { weight: 215, target: 8 },
    },
    {
      name: 'linear: one set short (8/7 boundary): repeat',
      slot: deadlift,
      state: { weight: 205, target: 8 },
      done: { weight: 205, values: [8, 8, 7] },
      next: { weight: 205, target: 8 },
    },
    {
      name: 'linear: 2 of 3 sets on a sore day: repeat',
      slot: frontSquat,
      state: { weight: 110, target: 8 },
      done: { weight: 110, values: [8, 8] },
      next: { weight: 110, target: 8 },
    },
    {
      name: 'linear: reps above the bottom of a wider range still earn the jump',
      slot: frontSquat,
      state: { weight: 110, target: 8 },
      done: { weight: 110, values: [10, 10, 10] },
      next: { weight: 115, target: 8 },
    },
    {
      name: 'linear: bottom of a wider range (8 of 8-10) is enough',
      slot: frontSquat,
      state: { weight: 110, target: 8 },
      done: { weight: 110, values: [8, 9, 10] },
      next: { weight: 115, target: 8 },
    },
    {
      name: 'linear: no weight recorded: hold, nothing to add to',
      slot: deadlift,
      state: { weight: 205, target: 8 },
      done: { weight: null, values: [8, 8, 8] },
      next: { weight: null, target: 8 },
    },
    // double: reps first, then weight
    {
      name: 'double: below the top: +1 rep',
      slot: pushdown,
      state: { weight: 100, target: 11 },
      done: { weight: 100, values: [11, 11, 11] },
      next: { weight: 100, target: 12 },
    },
    {
      name: 'double: at the top: +weight, reps reset to the bottom',
      slot: pushdown,
      state: { weight: 100, target: 12 },
      done: { weight: 100, values: [12, 12, 12] },
      next: { weight: 105, target: 10 },
    },
    {
      name: 'double: misses its target: repeat',
      slot: pushdown,
      state: { weight: 100, target: 11 },
      done: { weight: 100, values: [11, 11, 10] },
      next: { weight: 100, target: 11 },
    },
    {
      name: 'double: misses at the top: repeat, no weight jump',
      slot: pushdown,
      state: { weight: 100, target: 12 },
      done: { weight: 100, values: [12, 12, 11] },
      next: { weight: 100, target: 12 },
    },
    {
      name: 'double: fewer sets than prescribed: repeat',
      slot: pushdown,
      state: { weight: 100, target: 11 },
      done: { weight: 100, values: [11, 11] },
      next: { weight: 100, target: 11 },
    },
    {
      name: 'double: extra sets beyond the prescription still count',
      slot: pushdown,
      state: { weight: 100, target: 11 },
      done: { weight: 100, values: [11, 11, 11, 11] },
      next: { weight: 100, target: 12 },
    },
    {
      name: 'double: single-number range (12-12): success adds weight, target stays 12',
      slot: pallof,
      state: { weight: 30, target: 12 },
      done: { weight: 30, values: [12, 12, 12] },
      next: { weight: 32.5, target: 12 },
    },
    {
      name: 'double: bodyweight at the top, no load to add: stay',
      slot: lunges,
      state: { weight: null, target: 12 },
      done: { weight: null, values: [12, 12, 12] },
      next: { weight: null, target: 12 },
    },
    {
      name: 'double: bodyweight below the top: +1 rep',
      slot: lunges,
      state: { weight: null, target: 11 },
      done: { weight: null, values: [11, 11, 11] },
      next: { weight: null, target: 12 },
    },
    // progressive: bodyweight or timed
    {
      name: 'progressive: all sets: +1 rep',
      slot: legRaises,
      state: { weight: null, target: 10 },
      done: { weight: null, values: [10, 10, 10] },
      next: { weight: null, target: 11 },
    },
    {
      name: 'progressive: 2x10 instead of 3x10: repeat',
      slot: legRaises,
      state: { weight: null, target: 10 },
      done: { weight: null, values: [10, 10] },
      next: { weight: null, target: 10 },
    },
    {
      name: 'progressive: one set under target: repeat',
      slot: legRaises,
      state: { weight: null, target: 10 },
      done: { weight: null, values: [10, 10, 9] },
      next: { weight: null, target: 10 },
    },
    {
      name: 'progressive: seconds step (plank +2)',
      slot: plank,
      state: { weight: null, target: 30 },
      done: { weight: null, values: [30, 30, 30] },
      next: { weight: null, target: 32 },
    },
    // none: cardio
    {
      name: 'none: cardio is logged but nothing changes',
      slot: walk,
      state: { weight: null, target: 20 },
      done: { weight: null, values: [25] },
      next: { weight: null, target: 20 },
    },
  ])('$name', ({ slot, state, done, next }) => {
    expect(nextState(slot, state, done)).toEqual(next);
  });
});
