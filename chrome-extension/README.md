# Chrome Extension - Evidence Collection Suite

AI-powered compliance evidence collection with automated workflow generation using AWS Bedrock Nova 2 Lite.

## 🎯 Overview

This Chrome extension helps compliance teams automate evidence collection by:
- Using AI to understand compliance requirements
- Automatically navigating websites and capturing evidence
- Generating structured compliance reports
- Storing evidence securely in AWS S3

## 🔧 Prerequisites

- Node.js 16+ and npm
- AWS Account with:
  - Amazon Cognito (User Pool + Identity Pool)
  - Amazon Bedrock (Nova 2 Lite model access)
  - Amazon S3 bucket
- Chrome browser

## 📦 Installation

### 1. Install Dependencies

```bash
npm install
```

This installs:
- AWS SDK v3 packages (@aws-sdk/client-cognito-identity-provider, @aws-sdk/client-cognito-identity, @aws-sdk/client-bedrock-runtime, @aws-sdk/client-s3)
- Webpack and build tools
- Buffer polyfills for browser compatibility

### 2. Build the Extension

```bash
npm run build
```

This creates the `dist/` folder with bundled files.

### 3. Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder

## 🏗️ Architecture

### Security Improvements (Option 1)

This implementation addresses all security findings:

1. ✅ **AWS SDK v3 Integration** - Replaced custom HTTP calls with official AWS SDK
2. ✅ **Package Management** - Using npm instead of bundled 3.3MB file
3. ✅ **87% Size Reduction** - From 3.3MB to ~416KB

### File Structure

```
chrome-extension/
├── config/
│   └── workflow-config.json       # Workflow templates
├── core/
│   ├── background.js              # Service worker
│   ├── cognito-helper.js          # AWS Cognito utilities (SDK v3)
│   ├── content.js                 # DOM automation with ordinal support
│   ├── nova-agent.js              # Bedrock Nova 2 Lite integration
│   ├── s3-helper.js               # S3 operations (SDK v3)
│   ├── text-similarity.js         # Element matching
│   ├── tools.js                   # AI tool implementations
│   └── workflow-manager.js        # Workflow execution
├── ui/
│   ├── auth-sdk.js                # Cognito auth class (SDK v3)
│   ├── auth.html/js               # Authentication UI
│   ├── landing.html/js            # Landing page
│   ├── sidepanel.html/js          # Main chat interface
│   └── workflow-designer.html/js  # Workflow generator
├── manifest.json                  # Extension manifest
├── package.json                   # Dependencies
├── package-lock.json              # Dependencies versions
└── webpack.config.js              # Build configuration
```

## 🚀 Usage

### First Time Setup

1. Click the extension icon
2. Configure AWS resources:
   - Cognito User Pool ID
   - Cognito Client ID
   - Cognito Identity Pool ID
   - S3 Bucket Name
   - AWS Region
3. Log in with Cognito credentials

### Using the Extension

**Chat Interface:**
- Natural language commands: "navigate to aws.amazon.com"
- Automatic tool usage: "type 'nova sonic' and search"
- Ordinal references: "click the 2nd link"
- Screenshot capture: "take screenshot"

**Workflow Designer:**
- Upload compliance documents
- AI generates automated workflows
- Test and execute workflows
- Export evidence reports

## 🛠️ Development

### Build Commands

```bash
# Development build (with source maps)
npm run build

# Production build (minified)
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch
```

### Key Features

**Ordinal Element Selection:**
- "click the 1st link" - Clicks first link on page
- "click the 2nd button" - Clicks second button
- "click the 3rd search result" - Clicks third search result

**AI Tool Integration:**
- NavigateToURL - Navigate to websites
- ClickElement - Click elements by description
- TypeText - Fill forms and search boxes
- TakeScreenshot - Capture evidence with timestamps
- ScrollPage - Navigate long pages
- SelectCheckbox - Handle checkboxes

**System Prompts:**
- Loaded from S3 bucket
- Restricts AI to compliance-only queries
- Automatic tool usage without explicit commands

## 📝 Configuration

### AWS Resources Required

**Cognito User Pool:**
- Enable USER_PASSWORD_AUTH flow
- Configure app client without secret

**Cognito Identity Pool:**
- Enable unauthenticated access: No
- Add User Pool as authentication provider

**IAM Role Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/global.amazon.nova-2-lite-v1:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name/*",
        "arn:aws:s3:::your-bucket-name"
      ]
    }
  ]
}
```

**S3 Bucket Structure:**
```
your-bucket/
├── config/
│   └── prompts/
│       ├── compliance-assistant-prompt.txt
│       ├── workflow-designer-prompt.txt
│       └── report-analysis-prompt.txt
├── workflows/
│   └── workflow-config.json
└── evidence/
    ├── screenshots/
    └── reports/
```

## 🔍 Troubleshooting

**Extension not loading:**
- Ensure `npm run build` completed successfully
- Check `dist/` folder exists with all bundle files
- Reload extension in chrome://extensions/

**Authentication fails:**
- Verify Cognito configuration
- Check IAM role permissions
- Ensure Identity Pool is configured correctly

**AI not responding:**
- Check Bedrock model access in AWS region
- Verify system prompts exist in S3
- Check browser console for errors

**Tools not working:**
- Reload the page to inject content script
- Check if content.bundle.js is loaded
- Verify manifest.json permissions

## 📚 Additional Documentation

- [BUILD-SUCCESS.md](../BUILD-SUCCESS.md) - Build verification
- [IMPLEMENTATION-GUIDE.md](../IMPLEMENTATION-GUIDE.md) - Detailed implementation
- [MIGRATION-COMPLETE.md](../MIGRATION-COMPLETE.md) - Migration from legacy code

## 🤝 Contributing

When contributing:
1. Never commit `node_modules/` or `dist/` folders
2. Run `npm run build` to test changes
3. Test in Chrome before submitting
4. Update documentation for new features

## 📄 License

See [LICENSE](../LICENSE) file for details.
