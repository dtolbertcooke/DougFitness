// api/test/program.test.ts
// Integrity checks on the program data. It's ~400 lines of hand-typed numbers; these catch typos
// (a duplicated id, a target outside its range) before they reach a user's progression state.
import { describe, expect, it } from 'vitest';
import { PROGRAM } from '../src/program/program';

const slots = PROGRAM.flatMap((d) => d.slots.map((slot) => ({ day: d.day, slot })));

describe('PROGRAM', () => {
  it('has days 1 through 7, in order', () => {
    expect(PROGRAM.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('has Day 6 as a rest day with nothing to log', () => {
    expect(PROGRAM.find((d) => d.day === 6)?.slots).toEqual([]);
  });

  it('has unique slot ids', () => {
    const ids = slots.map(({ slot }) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(slots)('$slot.id: id is prefixed with its day', ({ day, slot }) => {
    expect(slot.id.startsWith(`d${day}-`)).toBe(true);
  });

  it.each(slots)('$slot.id: range is ordered and start.target sits inside it', ({ slot }) => {
    const [min, max] = slot.range;
    expect(min).toBeLessThanOrEqual(max);
    expect(slot.start.target).toBeGreaterThanOrEqual(min);
    expect(slot.start.target).toBeLessThanOrEqual(max);
  });

  it.each(slots)('$slot.id: has at least one set and positive increments', ({ slot }) => {
    expect(slot.sets).toBeGreaterThanOrEqual(1);
    const { rule } = slot;
    if (rule.kind === 'linear') expect(rule.increment).toBeGreaterThan(0);
    if (rule.kind === 'progressive') expect(rule.step).toBeGreaterThan(0);
    if (rule.kind === 'double' && rule.weightStep !== null) expect(rule.weightStep).toBeGreaterThan(0);
  });

  it.each(slots.filter(({ slot }) => slot.rule.kind === 'linear'))(
    '$slot.id: a linear lift starts with a weight to add to',
    ({ slot }) => {
      expect(slot.start.weight).not.toBeNull();
    },
  );

  it.each(slots.filter(({ slot }) => slot.unit === 'minutes'))(
    '$slot.id: cardio is a single log-only entry',
    ({ slot }) => {
      expect(slot.sets).toBe(1);
      expect(slot.rule.kind).toBe('none');
    },
  );
});
