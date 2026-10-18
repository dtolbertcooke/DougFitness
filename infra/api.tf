# infra/api.tf
# The API: a container image on Lambda behind a Function URL (free HTTPS, no load balancer or VPC).
# Secrets (MONGODB_URI, JWT_SECRET) live in SSM Parameter Store, created by hand so values never enter state.

data "aws_caller_identity" "current" {}

locals {
  name       = "dougfitness-api"
  ssm_prefix = "/dougfitness/prod"
  account_id = data.aws_caller_identity.current.account_id
}

resource "aws_ecr_repository" "api" {
  name                 = local.name
  image_tag_mutability = "IMMUTABLE" # a tag always means the same image, so rollback is exact

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# Lets the Lambda service pull images from this repository.
resource "aws_ecr_repository_policy" "lambda_pull" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "LambdaPull"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
      Condition = {
        StringLike = { "aws:sourceArn" = "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:*" }
      }
    }]
  })
}

resource "aws_iam_role" "api" {
  name = "${local.name}-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Read the app's own secrets and nothing else. The default aws/ssm key needs no separate KMS permission.
resource "aws_iam_role_policy" "api_ssm" {
  name = "read-ssm-params"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["ssm:GetParametersByPath"]
      Resource = [
        "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter${local.ssm_prefix}",
        "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter${local.ssm_prefix}/*",
      ]
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name = local.name
  package_type  = "Image"
  architectures = ["x86_64"]
  image_uri     = "${aws_ecr_repository.api.repository_url}:${var.initial_image_tag}"
  role          = aws_iam_role.api.arn
  memory_size   = 1024 # more memory also means more CPU, so faster cold starts
  timeout       = 15

  environment {
    variables = {
      NODE_ENV                     = "production"
      SSM_PREFIX                   = local.ssm_prefix
      AWS_LWA_READINESS_CHECK_PATH = "/healthz"
      # The adapter overwrites x-amzn-request-context with the real caller's address, which the auth rate
      # limiter keys on. Never set this anywhere a client could forge that header (see clientIp.ts).
      TRUST_LAMBDA_CONTEXT = "true"
    }
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy_attachment.api_logs, aws_ecr_repository_policy.lambda_pull]

  lifecycle {
    ignore_changes = [
      image_uri,   # CI deploys images; Terraform owns everything else
      description, # the runbook forces fresh instances by rewriting this field, so it must not show as drift
    ]
  }
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE" # public URL; the API enforces its own JWT auth
}

# A public (NONE) Function URL needs both of these in the function's resource policy, or callers get 403.
resource "aws_lambda_permission" "public_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "public_invoke" {
  statement_id             = "AllowPublicInvokeViaFunctionUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "*"
  invoked_via_function_url = true
}
