# Browser Evidence Collector - Chrome Extension

A comprehensive Chrome extension for SOX compliance evidence collection with AI-powered workflow automation and design capabilities.

## 🏗️ Architecture

The extension follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                         │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (sidepanel.html/js)                             │
│  ├── Chat Interface (Nova Pro AI Assistant)               │
│  ├── Workflow Management (Execute, Edit, View)            │
│  └── Authentication UI                                     │
├─────────────────────────────────────────────────────────────┤
│  AI Agent Layer                                            │
│  ├── Nova Pro Agent (Bedrock Integration)                 │
│  │   ├── Compliance Assistant (Q&A)                       │
│  │   └── Workflow Designer (Document Analysis)           │
│  └── Tool System (9 Core Chrome API Tools)                │
├─────────────────────────────────────────────────────────────┤
│  Workflow Engine                                           │
│  ├── Automated Workflow Execution                         │
│  ├── Workflow Designer (AI-Powered)                       │
│  └── Workflow Editor (Edit & Test)                        │
├─────────────────────────────────────────────────────────────┤
│  Storage & Services                                        │
│  ├── AWS S3 (Workflows, Screenshots, Logs, Prompts)       │
│  ├── Cognito Authentication                               │
│  └── Chrome Local Storage (Configuration)                 │
└─────────────────────────────────────────────────────────────┘
```

## ✨ Features

### 🤖 Automated Workflows
- **Pre-defined compliance workflows** stored in S3 for GitHub, AWS Console, and custom sites
- **Step-by-step execution** with navigation, screenshots, and user interactions
- **Screenshot capture** with timestamp overlays and organized S3 storage
- **User confirmation steps** for manual actions like login
- **Workflow editing** - Edit existing workflows and test before saving
- **Error handling** and workflow recovery with comprehensive logging

### 🧠 AI-Powered Workflow Designer
- **Document analysis** using Amazon Bedrock Nova Pro
- **Natural language workflow generation** from uploaded documents
- **Intelligent step extraction** and automation recommendations
- **Test mode** for validating workflows before saving
- **Edit mode** for modifying existing workflows
- **S3 integration** for centralized workflow storage

### 📸 Screenshot Management
- **Automatic timestamping** with overlay text
- **Organized S3 storage** with workflow-specific folder structure:
  - `evidence/YYYY/MM/DD/workflow-name/timestamp_domain_step-description.png`
- **In-chat image display** for immediate verification
- **Retry logic** to handle Chrome API failures
- **Page load synchronization** for fully rendered screenshots

### 🔐 Security & Authentication
- **AWS Cognito integration** for secure authentication
- **Role-based access control** with configurable permissions
- **Encrypted credential storage** using Chrome's secure storage
- **Session management** with automatic token refresh
- **Configuration management** - View and edit Cognito settings

### 💬 AI Chat Assistant
- **Compliance Q&A** powered by Nova Pro
- **Natural language commands** for browser automation
- **Real-time workflow execution** with status updates
- **Screenshot capture** on demand
- **Workflow guidance** and recommendations

## 📁 File Structure & Purpose

### Root Files
- **`manifest.json`** - Chrome extension configuration and permissions
- **`README.md`** - Project documentation
- **`.gitignore`** - Git ignore rules

### UI Files (`ui/`)
- **`auth.html/js`** - AWS Cognito authentication interface with settings management
- **`landing.html/js`** - Landing page with navigation to main features
- **`sidepanel.html/js`** - Main UI interface with chat and workflow management
- **`workflow-designer.html/js`** - AI-powered workflow designer and editor

### Core Files (`core/`)
- **`background.js`** - Service worker for extension lifecycle management
- **`content.js`** - Content script for DOM manipulation
- **`nova-pro-agent.js`** - Amazon Bedrock Nova Pro integration (2 modes: chat & designer)
- **`tools.js`** - 9 core Chrome API tools for browser automation
- **`workflow-manager.js`** - Workflow execution engine with S3 integration
- **`text-similarity.js`** - Text similarity for intelligent error recovery
- **`aws-sdk-s3.js`** - S3 integration for screenshot and workflow storage

### Configuration (`config/`)
- **`workflow-config.json`** - Seed workflows (loaded to S3 on first use)

### Deployment (`deployment/`)
- **`evidence-collector-cfn.yaml`** - CloudFormation template for AWS infrastructure

### Deprecated Files (`not-needed/`)
- Old prototypes, documentation, and unused code

## 🔧 Configuration

### AWS Setup
1. **Cognito User Pool**: Configure authentication
2. **Cognito Identity Pool**: Enable AWS service access
3. **S3 Bucket**: Set up for evidence storage with folder structure:
   ```
   bucket/
   ├── config/
   │   ├── prompts/
   │   │   ├── compliance-assistant-prompt.txt
   │   │   └── workflow-designer-prompt.txt
   │   └── workflows/
   │       └── user-workflows.json
   ├── evidence/
   │   └── YYYY/MM/DD/workflow-name/
   ├── workflow-documents/
   └── chat-logs/
   ```
4. **Bedrock Access**: Enable Nova Pro model access
5. **IAM Roles**: Configure appropriate permissions

### CloudFormation Deployment
Use `deployment/evidence-collector-cfn.yaml` to deploy:
- S3 bucket with folder structure
- Cognito User Pool and Identity Pool
- IAM roles and policies
- Lambda function for initial setup

### Extension Configuration
First-time setup in auth.html:
```json
{
  "region": "us-east-1",
  "userPoolId": "us-east-1_xxxxxxxxx",
  "clientId": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "identityPoolId": "us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "s3BucketName": "your-evidence-bucket"
}
```

**View/Edit Settings**: Click "View Settings" on auth page to see or modify configuration.

## 🚀 Usage Guide

### Getting Started
1. **Install Extension**: Load the extension in Chrome
2. **Deploy CloudFormation**: Create AWS resources using CFN template
3. **Configure Extension**: 
   - Click extension icon → Configure Settings
   - Enter Cognito and S3 details
   - Or click "View Settings" to edit existing configuration
4. **Authenticate**: Log in with Cognito credentials
5. **Upload Prompts**: Upload system prompts to S3 `config/prompts/` folder

### Workflow Management

#### Creating Workflows (AI Designer)
1. Click "AI Workflow Designer" from landing page
2. Upload compliance document (PDF, Word, etc.)
3. AI analyzes and generates workflow JSON
4. Review and edit generated workflow
5. Test workflow (navigates to sidepanel for execution)
6. Save to S3 after successful test

#### Editing Workflows
1. In sidepanel, click ⚙️ Workflows button
2. Select workflow and click "Edit"
3. Modify workflow JSON in designer
4. Test changes
5. Save updated workflow to S3

#### Executing Workflows
1. Click ⚙️ Workflows button in sidepanel
2. Select workflow from dropdown
3. Click "Execute"
4. Follow prompts for manual steps (login, etc.)
5. Monitor progress in chat
6. Review captured screenshots
7. Workflow log saved to S3 `chat-logs/`

### Chat Commands
```
- "take screenshot" - Capture current page
- "navigate to [URL]" - Go to specific page
- "scroll down/up" - Scroll page
- "click [element]" - Click on element
- "show workflows" - List available workflows
- Ask compliance questions - Get AI-powered answers
```

### Screenshot Organization
Screenshots are automatically organized in S3:
```
evidence/
└── 2026/
    └── 01/
        └── 17/
            └── github-sox-audit/
                ├── 20260117_143022_github-com_repository-settings.png
                ├── 20260117_143045_github-com_branch-protection.png
                └── 20260117_143108_github-com_audit-log.png
```

## 🤖 Core Chrome API Tools

The extension uses 9 core tools for browser automation:

1. **NavigateToURL** - Navigate to specified URL
2. **TakeScreenshot** - Capture and save screenshot with retry logic
3. **ClickElement** - Click on page elements
4. **TypeText** - Enter text into input fields
5. **ScrollPage** - Scroll up/down on page
6. **SelectCheckbox** - Toggle checkbox states
7. **ShowCheckboxes** - Display all checkboxes on page
8. **SearchWebsite** - Search within current website
9. **GitHubSearch** - Search GitHub repositories

## 📊 Workflow Logging

Every workflow execution creates a comprehensive log saved to S3:
```json
{
  "workflowName": "GitHub SOX Audit",
  "username": "john.doe",
  "startTime": "2026-01-17T14:30:00.000Z",
  "endTime": "2026-01-17T14:35:00.000Z",
  "status": "completed",
  "steps": [
    {
      "stepNumber": 1,
      "action": "navigate",
      "description": "Navigate to GitHub",
      "startTime": "2026-01-17T14:30:00.000Z",
      "endTime": "2026-01-17T14:30:05.000Z",
      "status": "success"
    }
  ]
}
```

## 🔍 Storage Architecture

### S3 Storage
- **Workflows**: `config/workflows/user-workflows.json` (primary source)
- **Prompts**: `config/prompts/*.txt` (AI system prompts)
- **Screenshots**: `evidence/YYYY/MM/DD/workflow-name/*.png`
- **Logs**: `chat-logs/*.json` (workflow execution logs)

### Chrome Local Storage
- **Cognito Config**: User Pool, Client ID, Identity Pool, S3 Bucket, Region
- **Session Data**: Authentication tokens, temporary workflow data

### Workflow Loading Priority
1. **Primary**: Load from S3 `config/workflows/user-workflows.json`
2. **First Time**: Load seed workflows from `workflow-config.json` → Save to S3
3. **Fallback**: Load from `workflow-config.json` if S3 fails (read-only)

## 🔧 Development

### Building the Extension
```bash
# No build step required - pure JavaScript
# Just load the extension folder in Chrome
```

### Loading for Development
1. Open Chrome → Extensions → Developer mode
2. Click "Load unpacked"
3. Select the chrome-extension folder
4. Make changes and click reload button to update

### Testing Workflows
1. Use "Test Workflow" button in designer
2. Executes workflow in sidepanel
3. Review screenshots and execution flow
4. Edit and re-test as needed
5. Save only after successful test

## 🛠️ Troubleshooting

### Common Issues
- **Authentication Failed**: Check Cognito configuration in "View Settings"
- **Screenshots Not Saving**: Verify S3 bucket permissions and IAM roles
- **Workflows Not Loading**: Check S3 bucket path `config/workflows/user-workflows.json`
- **AI Not Responding**: Verify Bedrock access and Nova Pro model permissions
- **Page Load Issues**: Extension uses retry logic and page load detection

### Debug Mode
Enable debug logging by opening Chrome DevTools → Console while using the extension.

### Configuration Issues
- Click "View Settings" on auth page to verify configuration
- Ensure all AWS resources are in the same region
- Check CloudFormation stack outputs for correct values

## 📝 Key Changes from Previous Versions

### Removed Features
- ❌ Interactive workflows (redundant with chat interface)
- ❌ SOX automation scripts (replaced by workflow system)
- ❌ Document analyzer (replaced by Nova Pro designer)
- ❌ Hardcoded system prompts (moved to S3)

### New Features
- ✅ S3-based workflow storage with edit capability
- ✅ AI-powered workflow designer with document analysis
- ✅ Workflow editing and testing flow
- ✅ Organized screenshot storage with workflow context
- ✅ Comprehensive workflow logging
- ✅ Page load synchronization for reliable screenshots
- ✅ Configuration viewing and editing
- ✅ Centralized prompt management in S3

## 📝 License

This project is proprietary software for SOX compliance evidence collection.

---

**Need Help?** Check the browser console for detailed error messages and ensure all AWS services are properly configured.
