# README

## Status

- v0.1 backend is live (Phases 0-4 complete). Next: Phase 5, the Expo app.

## About

DougFitness is a workout tracker built around my own training program. You log each set, and the API calculates your next session’s weights and rep targets from progression rules I turned into code and tested with a decision table.

Version 0.1 is the backend, and it’s live. It’s TypeScript, Express 5, and MongoDB Atlas, with validated input and JWT auth that only lets users reach their own data. It runs as a container on AWS Lambda, built with Terraform. GitHub Actions runs unit and integration tests on every pull request, and every merge to main deploys automatically. Two CloudWatch alarms email me on errors, each tied to a runbook I’ve tested with a drill.

Next is the React Native app in Expo. That’s the R in MERN, and it ships as version 1.0.

### Deployment trade-offs

- **The database is reachable from the internet.** Atlas M0 has no private networking and Lambda has no fixed outbound IP, so the access list allows `0.0.0.0/0`. What protects it: TLS, a database user limited to one database, and a long random password. Upgrade paths: Lambda in a VPC behind a NAT gateway with an Elastic IP (about $33 a month), or Atlas PrivateLink on a paid tier.
- **Tokens last 7 days.** The server keeps no session state, so a stolen token works until it expires. Upgrade path: short-lived access tokens plus rotating refresh tokens.
- **The sign-in rate limit is per Lambda instance.** It counts in memory, keyed on the caller’s real IP (see `api/src/middleware/clientIp.ts`). Upgrade path: a shared store.
- **Cold starts.** The first request after a quiet period takes about two seconds.
- **Terraform state is local** for now (`infra/`, gitignored). The S3 backend is a commented block in `infra/versions.tf`.

Runbook: `docs/runbooks/api-errors.md`. Drill write-up: `docs/drills/`.

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
