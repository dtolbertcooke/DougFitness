# infra/variables.tf
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "github_repo" {
  description = "GitHub repository allowed to deploy, as owner/name."
  type        = string
  default     = "dtolbertcooke/DougFitness"
}

variable "github_oidc_subject_prefix" {
  description = <<-EOT
    The repo part of the OIDC token's `sub` claim. Newer GitHub repos (and any renamed after 2026-07-15) use the
    immutable form `repo:<owner>@<ownerId>/<repo>@<repoId>`, not `repo:<owner>/<repo>`; the name-based form
    never matches those tokens. Read the right value from the repo itself:
      gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq .sub_claim_prefix
  EOT
  type        = string
  default     = "repo:dtolbertcooke@33268861/DougFitness@1376376235"
}

variable "initial_image_tag" {
  description = "Tag of the image Lambda starts with. CI deploys newer images; Terraform ignores image_uri after creation."
  type        = string
  default     = "bootstrap"
}

variable "alert_email" {
  description = "Where CloudWatch alarm emails go. Pass with TF_VAR_alert_email so it never lands in the repo."
  type        = string
}
