# AI-Powered Compliance Evidence Collector - Firefox Extension

Browser extension for automated compliance evidence collection using Amazon Bedrock AI agents.

## Features

- 🤖 AI-powered evidence collection using Amazon Bedrock Nova
- 📸 Automated screenshot capture
- 📄 Document extraction and analysis
- 🔄 Custom workflow creation and execution
- 🔐 Secure AWS Cognito authentication
- ☁️ Evidence storage in Amazon S3

## Prerequisites

- Firefox browser (version 109 or later)
- AWS Account with:
  - Amazon Bedrock access (Nova model enabled)
  - Amazon Cognito User Pool and Identity Pool
  - Amazon S3 bucket for evidence storage
- Node.js 18+ and npm (for building from source)

## Installation

### Option 1: Load Unpacked Extension (Development)

1. **Build the extension:**
   ```bash
   cd firefox-extension
   npm install
   npm run build
   ```

2. **Load in Firefox:**
   - Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Navigate to the `firefox-extension/dist` folder
   - Select the `manifest.json` file

### Option 2: Install from .xpi (Production)

1. Build and package:
   ```bash
   cd firefox-extension
   npm install
   npm run build
   cd dist
   zip -r ../firefox-extension.xpi *
   ```

2. Install the .xpi file in Firefox

## AWS Infrastructure Setup

Deploy the required AWS infrastructure using CloudFormation:

```bash
cd ../deployment
aws cloudformation create-stack \
  --stack-name compliance-evidence-collector \
  --template-body file://evidence-collector-cfn.yaml \
  --capabilities CAPABILITY_IAM
```

This creates:
- Cognito User Pool and Identity Pool
- S3 bucket with encryption
- IAM roles and policies

## Configuration

1. **Get AWS Configuration:**
   After CloudFormation deployment completes:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name compliance-evidence-collector \
     --query 'Stacks[0].Outputs'
   ```

2. **Configure Extension:**
   - Click the extension icon in Firefox toolbar
   - Click "Configure Settings"
   - Enter the values from CloudFormation outputs:
     - S3 Bucket Name
     - Identity Pool ID
     - User Pool ID
     - Client ID
     - Region (e.g., us-east-1)
   - Click "Save Configuration"

3. **Create User:**
   ```bash
   aws cognito-idp admin-create-user \
     --user-pool-id <YOUR_USER_POOL_ID> \
     --username <USERNAME> \
     --temporary-password <TEMP_PASSWORD>
   ```

4. **Sign In:**
   - Enter username and temporary password
   - Create a permanent password when prompted

## Usage

### Quick Evidence Collection

1. Navigate to the webpage containing evidence
2. Click the extension icon
3. Type your request: "Take a screenshot and save it as evidence"
4. The AI agent will capture and upload to S3

### Custom Workflows

1. Click "Workflow Designer" in the extension
2. Describe your workflow: "Review IAM access permissions quarterly"
3. The AI generates a step-by-step workflow
4. Save and execute the workflow

### Available Commands

The AI agent understands natural language commands:

- **Screenshots:** "Take a screenshot of this page"
- **Navigation:** "Click the 'Settings' button", "Scroll down", "Go to example.com"
- **Data Extraction:** "Extract all user names from this table"
- **File Upload:** "Upload this document to S3"
- **Workflows:** "Execute the IAM review workflow"

## Architecture

### Browser API Differences

This Firefox extension uses the `browser.*` API namespace instead of Chrome's `chrome.*` API:

```javascript
// Firefox
browser.runtime.sendMessage(...)
browser.storage.local.get(...)

// Chrome (for comparison)
chrome.runtime.sendMessage(...)
chrome.storage.local.get(...)
```

### Security Features

- ✅ AWS SDK v3 with official npm packages (no bundled SDKs)
- ✅ Secure Cognito authentication (no custom HTTP calls)
- ✅ Encrypted S3 storage
- ✅ Temporary credentials via Cognito Identity Pool
- ✅ Content Security Policy enforcement

### Build System

- **Webpack 5** for module bundling
- **Code splitting** for optimal bundle sizes
- **Tree shaking** to remove unused code
- **Minification** for production builds

## Development

### Project Structure

```
firefox-extension/
├── core/
│   ├── background.js          # Service worker
│   ├── content.js             # Page interaction
│   ├── cognito-helper.js      # AWS Cognito utilities
│   ├── s3-helper.js           # S3 operations
│   ├── nova-agent.js          # Bedrock AI agent
│   ├── workflow-manager.js    # Workflow execution
│   ├── tools.js               # Agent tools
│   └── text-similarity.js     # Text matching
├── ui/
│   ├── auth.html/js           # Authentication
│   ├── sidepanel.html/js      # Main interface
│   ├── workflow-designer.html/js  # Workflow creation
│   ├── landing.html/js        # Welcome page
│   ├── popup.html/js          # Browser action popup
│   └── auth-sdk.js            # Auth SDK wrapper
├── config/
│   └── workflow-config.json   # Workflow definitions
├── sample-documents/
│   └── aws-iam-access-review.txt
├── manifest.json              # Extension manifest
├── package.json               # Dependencies
└── webpack.config.js          # Build configuration
```

### Build Commands

```bash
# Install dependencies
npm install

# Production build (minified)
npm run build

# Development build with watch mode
npm run watch
```

### Bundle Sizes

| Bundle | Size | Purpose |
|--------|------|---------|
| vendors.bundle.js | 134 KB | Third-party libraries |
| aws-sdk.bundle.js | 89.5 KB | AWS SDK modules |
| sidepanel.bundle.js | 41.1 KB | Main UI |
| workflow-designer.bundle.js | 13 KB | Workflow designer |
| content.bundle.js | 9.5 KB | Content script |
| auth-sdk.bundle.js | 7.5 KB | Auth wrapper |
| Other bundles | ~5 KB | Auth, landing, popup, background |

**Total: ~300 KB** (91% smaller than original 3.3 MB bundled SDK)

## Troubleshooting

### Extension Won't Load

- Ensure you selected the `manifest.json` file in the `dist/` folder
- Check Firefox console for errors: `about:debugging#/runtime/this-firefox`
- Verify all files were copied during build

### Authentication Fails

- Verify AWS configuration values are correct
- Check Cognito User Pool has the user created
- Ensure Identity Pool has proper IAM roles
- Check browser console for detailed error messages

### AI Agent Not Responding

- Verify Amazon Bedrock access in your AWS account
- Ensure Nova model is enabled in your region
- Check S3 bucket permissions for system prompts
- Review background script logs in Firefox debugger

### Build Errors

- Delete `node_modules/` and `dist/` folders
- Run `npm install` again
- Ensure Node.js version is 18 or higher
- Check for webpack configuration errors

## Security Considerations

- Never commit AWS credentials to version control
- Use temporary credentials via Cognito Identity Pool
- Enable S3 bucket encryption
- Regularly rotate Cognito user passwords
- Review IAM policies for least privilege access
- Keep dependencies updated for security patches

## License

See LICENSE file in the root directory.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Firefox extension logs
3. Check AWS CloudWatch logs for backend errors
4. Verify AWS service quotas and limits

## Differences from Chrome Extension

- Uses `browser.*` API instead of `chrome.*`
- Manifest v2 instead of v3
- Sidebar support instead of side panel
- Browser action popup instead of action popup
- Different webpack polyfill configuration

Both extensions share the same core functionality and AWS integration.
