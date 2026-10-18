# infra/outputs.tf
output "api_url" {
  description = "Public HTTPS URL of the API (ends with a slash). Set it as the API_URL variable in GitHub Actions."
  value       = aws_lambda_function_url.api.function_url
}

output "deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN variable in GitHub Actions."
  value       = aws_iam_role.github_deploy.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}
