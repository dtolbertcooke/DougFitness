# infra/github.tf
# GitHub Actions deploys with short-lived credentials from OIDC, not stored access keys.
# An AWS account can hold only one OIDC provider per issuer, and this account already has GitHub's,
# so it is referenced rather than created.

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# Only workflow runs on main in this repository can assume the role.
resource "aws_iam_role" "github_deploy" {
  name = "dougfitness-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "${var.github_oidc_subject_prefix}:ref:refs/heads/main"
        }
      }
    }]
  })
}

# Least privilege: push to this one repository, and update this one function.
resource "aws_iam_role_policy" "github_deploy" {
  name = "deploy-api"
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*" # this action does not support resource-level permissions
      },
      {
        # The Dockerfile copies the Lambda Web Adapter from public.ecr.aws. Anonymous pulls from GitHub's shared
        # runner IPs get throttled (429), so CI logs in to ECR Public with these. Pulling needs nothing more.
        Sid      = "EcrPublicLogin"
        Effect   = "Allow"
        Action   = ["ecr-public:GetAuthorizationToken", "sts:GetServiceBearerToken"]
        Resource = "*" # neither action supports resource-level permissions
      },
      {
        Sid    = "EcrPushToApiRepo"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = aws_ecr_repository.api.arn
      },
      {
        Sid    = "UpdateApiFunction"
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration", # used by `aws lambda wait function-updated`
        ]
        # Built from the name, not aws_lambda_function.api.arn, so this role can be created before the
        # function exists. CI pushes the first image, and only then can Terraform create the function.
        Resource = "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${local.name}"
      },
    ]
  })
}
