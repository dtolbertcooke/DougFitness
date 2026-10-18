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

If this returns nothing but `dougfitness-api-lambda-errors` fired, the failure happened before Express started, so pino never logged a request. Read the raw log instead:

```bash
aws logs tail /aws/lambda/dougfitness-api --since 15m --format short | grep -E "Error|INIT_REPORT"
```

A startup failure looks like an `INIT_REPORT … Status: error … Runtime.ExitError` line next to the real error: a `ZodError` from config validation, an SSM `AccessDeniedException`, a `MongoServerError: bad auth`, or a `MongooseServerSelectionError`. The next section says what each means.

## 3. Common causes

| Symptom in the logs                                | Likely cause                                          | Fix                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `MongoServerError: bad auth : authentication failed` (code 8000) | Wrong or rotated password in the URI, or the Atlas user was edited or deleted | Atlas -> Database Access; fix `/dougfitness/prod/MONGODB_URI`, or restore a previous version (step 4) |
| `MongooseServerSelectionError`, timeouts           | Atlas outage, the access list no longer allows Lambda, or a wrong host | Check <https://status.mongodb.com>; Atlas -> Network Access must allow `0.0.0.0/0` |
| `ZodError` from `env()` at startup                 | A required parameter is missing or malformed in SSM   | Check `/dougfitness/prod/MONGODB_URI` and `JWT_SECRET` exist and have the right values        |
| `AccessDeniedException` from SSM                   | IAM role lost its SSM permission                      | `terraform plan` in `infra/` and look for drift on `aws_iam_role_policy.api_ssm`              |
| 5xx only on one route, with `err.message`          | A code bug                                            | Roll back (step 1), then write a failing test                                                 |

## 4. After changing a secret in SSM

Warm Lambda instances keep the value they loaded at startup. Force new instances:

```bash
aws lambda update-function-configuration --function-name dougfitness-api --description "restart $(date -u +%FT%TZ)"
aws lambda wait function-updated --function-name dougfitness-api
```

SSM keeps every version of a parameter, so a bad change can be undone without remembering the old value. List versions with `aws ssm get-parameter-history --name /dougfitness/prod/MONGODB_URI --query 'Parameters[].[Version,LastModifiedDate]'`, then put an earlier one back (the value never has to be printed):

```bash
aws ssm put-parameter --name /dougfitness/prod/MONGODB_URI --type SecureString --overwrite \
  --value "$(aws ssm get-parameter --name '/dougfitness/prod/MONGODB_URI:<version>' --with-decryption --query Parameter.Value --output text)"
```

Then force new instances as above.

## 5. Confirm recovery

`curl -fsS "<api_url>healthz"` returns `{"status":"ok"}`, and the alarms return to OK (you get a recovery email within a few minutes).
