# Evidence Collector - AWS Deployment Guide

Deploy the complete AWS infrastructure for the Evidence Collector Chrome Extension using CloudFormation.

---

## 📋 What Gets Deployed

### Authentication & Authorization
- **Cognito User Pool** - User authentication
- **Cognito Identity Pool** - AWS service access
- **IAM Roles & Policies** - Least privilege access control
- **Initial User** - AppUser with email invitation

### Storage
- **S3 Bucket** - Evidence, workflows, documents, logs
  - Encryption enabled (AES256)
  - Versioning enabled
  - Public access blocked
  - CORS configured for Chrome extension

### AI & Automation
- **Bedrock Access** - Amazon Nova Pro model permissions
- **System Prompts** - Pre-configured AI prompts uploaded to S3
- **Folder Structure** - Organized evidence storage

### Email (Optional)
- **SES Email Verification** - For sending reports

---

## 🚀 Quick Start

### Prerequisites
- AWS CLI installed and configured
- AWS account with admin permissions
- Valid email addresses (will receive temporary password)

### Deploy Stack

```bash
aws cloudformation create-stack \
  --stack-name evidence-collector \
  --template-body file://evidence-collector-cfn.yaml \
  --parameters \
    ParameterKey=UserEmail,ParameterValue=your-email@example.com \
    ParameterKey=AdminEmail,ParameterValue=admin@example.com \
    ParameterKey=BucketName,ParameterValue=my-evidence-bucket \
    ParameterKey=Environment,ParameterValue=prod \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

### Monitor Deployment

```bash
# Watch stack creation
aws cloudformation describe-stack-events \
  --stack-name evidence-collector \
  --max-items 20

# Check stack status
aws cloudformation describe-stacks \
  --stack-name evidence-collector \
  --query 'Stacks[0].StackStatus'
```

### Get Configuration Values

```bash
# Get all outputs
aws cloudformation describe-stacks \
  --stack-name evidence-collector \
  --query 'Stacks[0].Outputs' \
  --output table

# Get specific values for Chrome extension
aws cloudformation describe-stacks \
  --stack-name evidence-collector \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text
```

---

## ⚙️ Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `Environment` | Environment name (dev/staging/prod) | `dev` | No |
| `UserEmail` | Email for initial user (receives temp password) | - | Yes |
| `AdminEmail` | Admin email for SES verification | - | Yes |
| `BucketName` | S3 bucket name prefix | `evidence-collector-bucket` | No |

**Note:** Actual bucket name will be: `{BucketName}-{AccountId}-{Region}`

---

## 📊 Outputs

After deployment, you'll get these values (needed for Chrome extension):

| Output | Description | Use In Extension |
|--------|-------------|------------------|
| `UserPoolId` | Cognito User Pool ID | Configuration → User Pool ID |
| `UserPoolClientId` | Cognito Client ID | Configuration → Client ID |
| `IdentityPoolId` | Cognito Identity Pool ID | Configuration → Identity Pool ID |
| `EvidenceBucketName` | S3 Bucket name | Configuration → S3 Bucket |
| `Region` | AWS Region | Configuration → Region |
| `CreatedUsername` | Username for login | Login → Username: `AppUser` |

---

## 🔧 Post-Deployment Steps

### 1. Check Email for Temporary Password
- Check the inbox for `UserEmail`
- Subject: "Welcome to Evidence Collector - Your Account Details"
- Note the temporary password

### 2. Verify SES Email (Optional)
- Check the inbox for `AdminEmail`
- Click the verification link from AWS SES
- Required only if you want to send email reports

### 3. Configure Chrome Extension
1. Open Chrome Extension
2. Click extension icon → Configure
3. Enter the output values:
   - Region: `us-east-1` (or your region)
   - User Pool ID: From outputs
   - Client ID: From outputs
   - Identity Pool ID: From outputs
   - S3 Bucket: From outputs

### 4. Login to Extension
- Username: `AppUser`
- Password: Temporary password from email
- You'll be prompted to create a new password

### 5. Verify Setup
- Test screenshot capture
- Test workflow execution
- Check S3 bucket for evidence

---

## 🗂️ S3 Bucket Structure

After deployment, your S3 bucket will have this structure:

```
s3://your-bucket-name/
├── config/
│   ├── prompts/
│   │   ├── compliance-assistant-prompt.txt
│   │   └── workflow-designer-prompt.txt
│   └── workflows/
│       └── user-workflows.json (created by extension)
├── evidence/
│   └── YYYY/MM/DD/workflow-name/
│       └── screenshots.png
├── workflow-documents/
│   └── uploaded-documents.pdf
├── chat-logs/
│   └── conversation-logs.json
└── reports/
    └── YYYY/MM/DD/
        └── evidence-reports.html
```

---

## 💰 Cost Estimate

### Monthly Costs (Typical Usage)

**Base Infrastructure (Always Running):**
- Cognito: $0 (free tier: 50,000 MAUs)
- S3 Storage (10 GB): ~$0.23
- Lambda: $0 (free tier: 1M requests)

**Usage-Based:**
- Bedrock Nova Pro: ~$0.003 per workflow
- S3 Data Transfer: $0.09/GB (outbound)
- SES: $0.10 per 1,000 emails

**Example: 100 workflows/month**
- Bedrock: $0.30
- S3 Storage: $0.23
- S3 Transfer: $0.09
- **Total: ~$0.62/month**

**Example: 1,000 workflows/month**
- Bedrock: $3.00
- S3 Storage: $0.50
- S3 Transfer: $0.50
- **Total: ~$4.00/month**

---

## 🔒 Security Features

### Enabled by Default
- ✅ S3 bucket encryption (AES256)
- ✅ S3 versioning enabled
- ✅ S3 public access blocked
- ✅ Cognito advanced security mode
- ✅ Strong password policy (8+ chars, upper, lower, number, symbol)
- ✅ IAM least privilege policies
- ✅ CORS restricted to Chrome extensions only
- ✅ Admin-only user creation

### IAM Permissions Granted
Users in `AppUsersGroup` can:
- Invoke Bedrock Nova Pro model
- Read/write to specific S3 folders (evidence, workflows, etc.)
- Send emails via SES (for reports)
- List S3 bucket contents (scoped to allowed folders)

Users **cannot**:
- Access other AWS services
- Modify IAM policies
- Delete the S3 bucket
- Access other users' data

---

## 🧪 Testing Deployment

### Validate Template

```bash
aws cloudformation validate-template \
  --template-body file://evidence-collector-cfn.yaml
```

### Deploy to Test Environment

```bash
aws cloudformation create-stack \
  --stack-name evidence-collector-test \
  --template-body file://evidence-collector-cfn.yaml \
  --parameters \
    ParameterKey=UserEmail,ParameterValue=test@example.com \
    ParameterKey=AdminEmail,ParameterValue=admin@example.com \
    ParameterKey=BucketName,ParameterValue=test-evidence \
    ParameterKey=Environment,ParameterValue=dev \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

### Verify Resources

```bash
# Check Cognito User Pool
aws cognito-idp describe-user-pool \
  --user-pool-id <UserPoolId>

# Check S3 Bucket
aws s3 ls s3://<BucketName>/config/prompts/

# Check IAM Roles
aws iam get-role --role-name <RoleName>
```

---

## 🔄 Updating Stack

### Update Existing Stack

```bash
aws cloudformation update-stack \
  --stack-name evidence-collector \
  --template-body file://evidence-collector-cfn.yaml \
  --parameters \
    ParameterKey=UserEmail,UsePreviousValue=true \
    ParameterKey=AdminEmail,UsePreviousValue=true \
    ParameterKey=BucketName,UsePreviousValue=true \
    ParameterKey=Environment,UsePreviousValue=true \
  --capabilities CAPABILITY_IAM
```

### Force Prompt Update

The Lambda function uploads prompts on stack creation/update. To force a prompt update:

1. Edit the template
2. Increment the `Version` property in `PromptUploader` resource
3. Update the stack

---

## 🗑️ Cleanup

### Delete Stack

```bash
# IMPORTANT: Empty S3 bucket first (CloudFormation can't delete non-empty buckets)
aws s3 rm s3://<BucketName> --recursive

# Delete stack
aws cloudformation delete-stack --stack-name evidence-collector

# Monitor deletion
aws cloudformation describe-stack-events \
  --stack-name evidence-collector \
  --max-items 20
```

### Manual Cleanup (if needed)

If stack deletion fails:

```bash
# Delete S3 bucket manually
aws s3 rb s3://<BucketName> --force

# Delete Cognito User Pool
aws cognito-idp delete-user-pool --user-pool-id <UserPoolId>

# Delete Identity Pool
aws cognito-identity delete-identity-pool --identity-pool-id <IdentityPoolId>

# Retry stack deletion
aws cloudformation delete-stack --stack-name evidence-collector
```

---

## 🐛 Troubleshooting

### Stack Creation Failed

**Check CloudFormation Events:**
```bash
aws cloudformation describe-stack-events \
  --stack-name evidence-collector \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
```

**Common Issues:**

1. **Bucket name already exists**
   - Solution: Change `BucketName` parameter

2. **Insufficient permissions**
   - Solution: Ensure AWS CLI user has admin permissions

3. **Invalid email format**
   - Solution: Use valid email addresses for parameters

4. **Region not supported**
   - Solution: Use a region that supports Bedrock (us-east-1, us-west-2)

### Extension Can't Connect

1. **Verify outputs match extension config**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name evidence-collector \
     --query 'Stacks[0].Outputs'
   ```

2. **Check Cognito user exists**
   ```bash
   aws cognito-idp admin-get-user \
     --user-pool-id <UserPoolId> \
     --username AppUser
   ```

3. **Verify S3 bucket accessible**
   ```bash
   aws s3 ls s3://<BucketName>/config/prompts/
   ```

### Prompts Not Loading

**Re-upload prompts:**
1. Increment `Version` in `PromptUploader` resource
2. Update stack
3. Check Lambda logs:
   ```bash
   aws logs tail /aws/lambda/<FunctionName> --follow
   ```

---

## 📚 Additional Resources

- [AWS CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)
- [Amazon Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Chrome Extension Documentation](../README.md)

---

## 🆘 Support

For issues or questions:
1. Check CloudFormation events for error messages
2. Review CloudWatch logs for Lambda function
3. Verify IAM permissions
4. Check AWS service quotas

---

**Deployment Time:** ~5-10 minutes  
**Cleanup Time:** ~2-5 minutes  
**Difficulty:** Easy (single command deployment)
