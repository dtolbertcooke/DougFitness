# infra/versions.tf
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state in S3. use_lockfile is S3's native locking (Terraform 1.10+): it writes a `.tflock` object next to
  # the state using a conditional write, so no DynamoDB table is needed. The bucket is created by hand (a state
  # bucket cannot be managed by the state it holds):
  #
  #   B=dougfitness-tfstate-975049995039
  #   aws s3api create-bucket --bucket $B --region us-east-1
  #   aws s3api put-public-access-block --bucket $B --public-access-block-configuration \
  #     BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  #   aws s3api put-bucket-versioning --bucket $B --versioning-configuration Status=Enabled
  #   aws s3api put-bucket-encryption --bucket $B --server-side-encryption-configuration \
  #     '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
  #   (plus a bucket policy denying aws:SecureTransport=false, and a lifecycle rule expiring noncurrent
  #   versions after 90 days)
  #
  # Versioning is the safety net: any earlier state is a `aws s3api list-object-versions` away.
  backend "s3" {
    bucket       = "dougfitness-tfstate-975049995039"
    key          = "dougfitness/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = { Project = "dougfitness" }
  }
}
