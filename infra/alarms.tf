# infra/alarms.tf
# Two alarms, because they catch different failures:
#  - api_5xx:   Express turns exceptions into 500 responses, which Lambda counts as successful invocations.
#               A log metric filter counts them from pino's JSON output.
#  - api_errors: crashes, timeouts and failed startups (for example a missing secret) never reach Express.
#               Lambda's own Errors metric catches those.
# At portfolio traffic any error is worth an email, so the threshold is zero.

locals {
  runbook_url = "https://github.com/${var.github_repo}/blob/main/docs/runbooks/api-errors.md"
}

resource "aws_sns_topic" "alerts" {
  name = "dougfitness-alerts"
}

# AWS emails a confirmation link; the subscription does nothing until it is clicked.
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_log_metric_filter" "api_5xx" {
  name           = "api-5xx"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.res.statusCode >= 500 }"

  metric_transformation {
    name          = "Api5xx"
    namespace     = "DougFitness"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "dougfitness-api-5xx"
  alarm_description   = "API returned 5xx. Runbook: ${local.runbook_url}"
  namespace           = "DougFitness"
  metric_name         = "Api5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "dougfitness-api-lambda-errors"
  alarm_description   = "Lambda invocation errors (crash, timeout, failed startup). Runbook: ${local.runbook_url}"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
