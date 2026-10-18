# infra/versions.tf
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State is local for now (infra/terraform.tfstate, gitignored): fine for one person, but if this laptop
  # dies so does the state. To move it to S3, create a versioned bucket, add the block below, and run
  # `terraform init -migrate-state` (no DynamoDB needed with use_lockfile).
  #
  # backend "s3" {
  #   bucket       = "<your-state-bucket>"
  #   key          = "dougfitness/terraform.tfstate"
  #   region       = "us-east-1"
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = { Project = "dougfitness" }
  }
}
