# Runbook: API errors

Linked from both CloudWatch alarm emails. Region `us-east-1`, function and log group `dougfitness-api`.

| Alarm                           | Means                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `dougfitness-api-5xx`           | Express returned a 5xx (an exception inside a request). Found by a metric filter on the JSON logs.      |
| `dougfitness-api-lambda-errors` | Lambda itself failed: crash, timeout, or failed startup (for example a missing secret or bad Mongo URI). |

Both fire on any error in a 5-minute window and send an email when they recover.

## 1. Did a deploy just happen?

Check the latest `ci` run on `main` (GitHub, Actions tab). If the errors started right after a deploy, **roll back first, investigate after**:

```bash
# newest images last; pick the tag (a commit SHA) deployed before the bad one
aws ecr describe-images --repository-name dougfitness-api \
  --query 'sort_by(imageDetails,&imagePushedAt)[].[imageTags[0],imagePushedAt]' --output table

REGISTRY=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com
aws lambda update-function-code --function-name dougfitness-api --image-uri "$REGISTRY/dougfitness-api:<previous-sha>"
aws lambda wait function-updated --function-name dougfitness-api
curl -fsS "<api_url>healthz"
```

Images are immutable and tagged by commit SHA, so a rollback is exact. Fix forward on a branch; the next merge to `main` deploys again.

## 2. Read the logs

CloudWatch -> Logs Insights -> log group `/aws/lambda/dougfitness-api`:

```text
fields @timestamp, req.method, req.url, res.statusCode, responseTime, err.message
| filter res.statusCode >= 500 or ispresent(err.message)
| sort @timestamp desc
| limit 50
```

If this returns nothing but `dougfitness-api-lambda-errors` fired, the failure happened before Express started. Look at the raw log stream for the newest invocation for a startup error (`ZodError` from config validation, an SSM `AccessDeniedException`, or a Mongo `MongooseServerSelectionError`).

## 3. Common causes

| Symptom in the logs                                | Likely cause                                          | Fix                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `MongooseServerSelectionError`, timeouts           | Atlas outage, wrong URI/password, or access list      | Check <https://status.mongodb.com>; Atlas -> Network Access must allow `0.0.0.0/0`; check the user |
| `ZodError` from `env()` at startup                 | A required parameter is missing or malformed in SSM   | Check `/dougfitness/prod/MONGODB_URI` and `JWT_SECRET` exist and have the right values        |
| `AccessDeniedException` from SSM                   | IAM role lost its SSM permission                      | `terraform plan` in `infra/` and look for drift on `aws_iam_role_policy.api_ssm`              |
| 5xx only on one route, with `err.message`          | A code bug                                            | Roll back (step 1), then write a failing test                                                 |

## 4. After changing a secret in SSM

Warm Lambda instances keep the value they loaded at startup. Force new instances:

```bash
aws lambda update-function-configuration --function-name dougfitness-api --description "restart $(date -u +%FT%TZ)"
aws lambda wait function-updated --function-name dougfitness-api
```

## 5. Confirm recovery

`curl -fsS "<api_url>healthz"` returns `{"status":"ok"}`, and the alarms return to OK (you get a recovery email within a few minutes).
