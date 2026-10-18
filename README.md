# README

## Status

- IN PROGRESS - Phase 2

## About

- DougFitness: a MERN + AWS mobile app

## Testing

From `api/`: `npm run lint && npm run typecheck && npm test`. Integration tests run against an in-memory
MongoDB replica set (`mongodb-memory-server`), so transactions work without Docker or Atlas.

### Progression rules: decision table

`api/src/program/progression.ts` holds the rules as a pure function (`nextState`). Every slot in
`api/src/program/program.ts` uses exactly one of four rules. **Success** means every prescribed set was
logged and each reached the bar: the bottom of the range for `linear`, the current target for `double`
and `progressive`.

| Rule          | Used for                                             | After a successful session                                                       | After a miss      |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------- |
| `linear`      | Main barbell lifts                                   | Weight + the lift's increment                                                    | Repeat the weight |
| `double`      | Other weighted lifts, bodyweight lifts with a range  | Target reps + 1; at the top of the range, weight + one step and reps reset       | Repeat            |
| `progressive` | Plank, dead bugs, lying leg raises                   | Target + step (reps or seconds)                                                  | Repeat            |
| `none`        | Incline walks, zone 2 cardio                         | Nothing changes; the session is logged                                           | n/a               |

Two rules the training notes didn't spell out came out of building this table: a main lift that misses the
bottom of its range repeats the weight, and logging fewer sets than prescribed counts as a miss.

### Boundary values

`api/test/progression.test.ts` has one row per table cell plus the boundaries around them: the bottom of a
main lift's range (8 passes, 7 repeats); a target one below the top versus at the top; a single-number range
(Pallof press, 12 to 12); a bodyweight lift at the top with no load to add; fewer sets than prescribed;
extra sets beyond the prescription; and a lift logged without a weight. `api/test/program.test.ts` checks the
program data itself for typos (unique slot ids, targets inside their ranges).

### API behaviour

- **Ownership:** `ownership.test.ts` proves user B gets 404, not 403, when reading, logging to, or completing
  user A's session.
- **State transitions:** logging to or completing a session that is already completed returns 409; only one
  session can be in progress per user (a partial unique index, tested with simultaneous requests).
- **Atomic completion:** completing a session updates the session and the program state in one transaction;
  a test forces the second write to fail and checks the first was rolled back.

### Demo data

`npm run seed` (from `api/`, needs `api/.env` pointing at a **dev** database) creates `demo@dougfitness.dev`
and replays eight weeks of training through the real service functions, including a few misses and short
sessions. It refuses to run with `NODE_ENV=production` or against any database whose name doesn't contain
"dev" or "test", and does nothing if the demo user already exists.

## 7-Phase Plan

### Phase 0: Setup

**Goal:** a public repo where every PR is linted, type-checked, and tested automatically.

### Phase 1: API core and auth

**Goal:** a local API with sign-up, sign-in, and profile endpoints, every v0 security bug fixed and proven fixed by a test.

### Phase 2: Your program as code

**Goal:** My 7-day program running through the API: start a day, log each exercise, finish, and get next session's weights and rep targets from my set rules.

### Phase 3: Deploy to AWS

**Goal:** the API live at an HTTPS URL, deployed automatically on every merge to `main`.

### Phase 4: Monitoring and alerting

**Goal:** setup notifications about failures before a user gets them, and the alert tells you what to do.

### Phase 5: The mobile app

**Goal:** an Android app that runs the program: it shows today's day, logs each exercise, times your rest, and shows history and progress.

### Phase 6: Update README and release v1.0.0

**Goal:** update README to reflect what project is, understand how it works, and provide evidence of it operating correctly.
