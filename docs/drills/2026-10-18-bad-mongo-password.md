# Drill: bad Mongo password in production (2026-10-18)

Goal: prove the `dougfitness-api-lambda-errors` alarm fires on a failed startup, that the alert leads to the runbook, and that production can be restored from SSM history.

1. **Break:** overwrote the `MONGODB_URI` SSM parameter with the same URI but a wrong password (version 4), then forced new Lambda instances. Every request returned `502` because the container exited during init.
2. **Alert:** CloudWatch moved `dougfitness-api-lambda-errors` from OK to ALARM 50 seconds after the change, and the SNS email action reported success 48 ms later. Both the alert and the recovery email arrived in the inbox. `dougfitness-api-5xx` stayed OK, as expected: the app never started, so Express never logged a 5xx. That alarm covers a different failure (exceptions inside a request) and this drill does not exercise it.
3. **Diagnose (runbook steps 1-3):** no deploy was involved. The Logs Insights query returns nothing for a startup failure, and the raw log shows `INIT_REPORT … Runtime.ExitError` next to `MongoServerError: bad auth : authentication failed` (code 8000).
4. **Restore:** rewrote the parameter from SSM version 3 (checked byte-identical by hash, without printing the secret) as version 5, forced new instances, and `/healthz` returned 200. The alarm returned to OK about 4 minutes later, and a recovery email action fired.
5. **Finding:** the runbook's cause table only listed `MongooseServerSelectionError` for a wrong password, but the real error is `MongoServerError: bad auth`. The runbook now lists both, shows how to read a startup failure from the raw log, and documents restoring a previous parameter version.

| Time (UTC) | Event |
| ---------- | ----- |
| 20:50:18 | SSM `MONGODB_URI` overwritten with a bad password (version 4) |
| 20:50:28 | New Lambda instances forced; first `502` responses |
| 20:51:08 | Alarm OK -> ALARM; SNS email action executed |
| 20:51:43 | Restored the original value as version 5 |
| 20:51:58 | New instances forced; `/healthz` returns 200 |
| 20:56:08 | Alarm ALARM -> OK; SNS email action executed |

Outage as seen by callers: about 1 minute 40 seconds (20:50:28 to 20:51:58).
