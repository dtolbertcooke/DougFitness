# infra/variables.tf
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "github_repo" {
  description = "GitHub repository allowed to deploy, as owner/name."
  type        = string
  default     = "dtolbertcooke/DougFitness_v1"
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
