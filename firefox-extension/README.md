# Browser Evidence Collector - Firefox Extension

Firefox version of the AI-powered SOX compliance evidence collection extension.

## 🦊 Firefox-Specific Notes

This is a Firefox-compatible version of the Chrome Extension. Key differences:

### Manifest Differences
- **Manifest V2** (Firefox has limited V3 support)
- **sidebar_action** instead of side_panel
- **browser_action** with popup for quick access
- **background scripts** instead of service workers
- **browser_specific_settings** for Firefox metadata

### API Differences
- Uses `browser.*` namespace (with Chrome compatibility)
- Different screenshot capture API
- Different storage API behavior
- No `chrome.sidePanel` API

### Browser Compatibility
- **Minimum Firefox Version**: 109.0
- **Recommended**: Firefox 115+ (ESR)
- **Tested on**: Firefox 121+

## 🏗️ Architecture

Same core architecture as Chrome version with Firefox-specific adaptations:

```
┌─────────────────────────────────────────────────────────────┐
│                    Firefox Extension                        │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (sidebar + popup)                                │
│  ├── Sidebar (auth.html/js) - Main interface              │
│  ├── Popup (popup.html/js) - Quick actions                │
│  ├── Chat Interface (Nova Pro AI Assistant)               │
│  └── Workflow Management                                   │
├─────────────────────────────────────────────────────────────┤
│  AI Agent Layer                                            │
│  ├── Nova Pro Agent (Bedrock Integration)                 │
│  │   ├── Compliance Assistant (Q&A)                       │
│  │   └── Workflow Designer (Document Analysis)           │
│  └── Tool System (9 Core Browser API Tools)               │
├─────────────────────────────────────────────────────────────┤
│  Workflow Engine                                           │
│  ├── Automated Workflow Execution                         │
│  ├── Workflow Designer (AI-Powered)                       │
│  └── Workflow Editor (Edit & Test)                        │
├─────────────────────────────────────────────────────────────┤
│  Storage & Services                                        │
│  ├── AWS S3 (Workflows, Screenshots, Logs, Prompts)       │
│  ├── Cognito Authentication                               │
│  └── Firefox Storage (Configuration)                      │
└─────────────────────────────────────────────────────────────┘
```

## ✨ Features

All features from Chrome version are supported:

### 🤖 Automated Workflows
- Pre-defined compliance workflows stored in S3
- Step-by-step execution with navigation and screenshots
- Screenshot capture with timestamp overlays
- User confirmation steps for manual actions
- Workflow editing and testing
- Error handling and recovery

### 🧠 AI-Powered Workflow Designer
- Document analysis using Amazon Bedrock Nova Pro
- Natural language workflow generation
- Intelligent step extraction
- Test and edit capabilities
- S3 integration for workflow storage

### 📸 Screenshot Management
- Automatic timestamping with overlay
- Organized S3 storage by date and workflow
- In-sidebar image display
- Retry logic for API failures
- Page load synchronization

### 🔐 Security & Authentication
- AWS Cognito integration
- Role-based access control
- Encrypted credential storage
- Session management
- Configuration management

### 💬 AI Chat Assistant
- Compliance Q&A powered by Nova Pro
- Natural language commands
- Real-time workflow execution
- Screenshot capture on demand
- Workflow guidance

## 📁 File Structure

Same structure as Chrome version:

```
firefox-extension/
├── manifest.json          # Firefox Manifest V2
├── README.md             # This file
├── LICENSE
├── .gitignore
├── ui/                   # UI components
│   ├── auth.html/js      # Authentication & main interface
│   ├── popup.html/js     # Browser action popup
│   ├── landing.html/js   # Landing page
│   ├── sidepanel.html/js # Main sidebar interface
│   └── workflow-designer.html/js
├── core/                 # Core logic
│   ├── background.js     # Background script (not service worker)
│   ├── content.js        # Content script
│   ├── nova-pro-agent.js # Bedrock integration
│   ├── tools.js          # Browser automation tools
│   ├── workflow-manager.js
│   ├── text-similarity.js
│   └── aws-sdk-s3.js
├── config/               # Configuration
│   └── workflow-config.json
└── deployment/           # AWS deployment
    ├── evidence-collector-cfn.yaml
    └── README.md
```

## 🚀 Installation

### For Development

1. **Open Firefox**
2. **Navigate to** `about:debugging#/runtime/this-firefox`
3. **Click** "Load Temporary Add-on"
4. **Select** `manifest.json` from this directory
5. **Extension loads** and appears in toolbar

### For Testing

1. **Deploy AWS Infrastructure** (same CloudFormation as Chrome version)
2. **Configure Extension**:
   - Click extension icon → Open sidebar
   - Enter Cognito and S3 details
3. **Authenticate** with Cognito credentials
4. **Test** screenshot capture and workflows

### Permanent Installation

For permanent installation (not temporary):

1. **Package extension**:
   ```bash
   cd firefox-extension
   zip -r evidence-collector-firefox.zip * -x "*.git*" -x "*.DS_Store"
   ```

2. **Sign with Mozilla** (for distribution):
   - Create account at https://addons.mozilla.org
   - Submit for review
   - Get signed XPI file

3. **Self-distribution** (for internal use):
   - Use Firefox Developer Edition or Nightly
   - Disable signature requirement: `about:config` → `xpinstall.signatures.required` → false

## 🔧 Configuration

Same AWS setup as Chrome version:

1. **Cognito User Pool**: Configure authentication
2. **Cognito Identity Pool**: Enable AWS service access
3. **S3 Bucket**: Set up for evidence storage
4. **Bedrock Access**: Enable Nova Pro model
5. **IAM Roles**: Configure permissions

Use the same CloudFormation template from `deployment/` folder.

## 🔍 Firefox-Specific Differences

### API Namespace
Firefox supports both `browser.*` and `chrome.*` namespaces. This extension uses:
- `browser.*` for Firefox-specific features
- Chrome compatibility shim for cross-browser support

### Screenshot API
Firefox uses `browser.tabs.captureVisibleTab()` instead of `chrome.tabs.captureVisibleTab()`:
- Same parameters
- Same return format
- Slightly different timing behavior

### Storage API
Firefox storage has some differences:
- `browser.storage.local` has no quota limit (Chrome: 10MB)
- `browser.storage.sync` has 100KB limit (Chrome: 100KB)
- Session storage works differently

### Sidebar vs Side Panel
Firefox uses `sidebar_action` (Manifest V2) instead of Chrome's `side_panel` (Manifest V3):
- Sidebar is always available (not per-tab)
- Can be toggled with keyboard shortcut
- Persists across tabs

### Background Scripts
Firefox uses persistent/non-persistent background scripts instead of service workers:
- Event-driven like service workers
- Can be persistent or non-persistent
- Different lifecycle management

## 🐛 Known Issues & Limitations

### Firefox-Specific Issues

1. **Sidebar Persistence**: Sidebar state doesn't persist across browser restarts (by design)
2. **Screenshot Timing**: May need longer delays for complex pages
3. **AWS SDK**: Some AWS SDK features may behave differently in Firefox
4. **Content Security Policy**: Stricter CSP in Firefox may affect some features

### Workarounds

- **Sidebar State**: Use storage API to save/restore state
- **Screenshot Timing**: Increased wait times in workflow engine
- **AWS SDK**: Tested and working with current implementation
- **CSP**: Inline scripts moved to separate files

## 🧪 Testing

### Manual Testing Checklist

- [ ] Extension loads without errors
- [ ] Sidebar opens and displays auth page
- [ ] Cognito authentication works
- [ ] Screenshot capture works
- [ ] Workflow execution completes
- [ ] S3 upload succeeds
- [ ] AI chat responds correctly
- [ ] Workflow designer generates workflows
- [ ] Error recovery works

### Automated Testing

```bash
# Install web-ext for testing
npm install -g web-ext

# Run extension in Firefox
web-ext run --source-dir=.

# Lint extension
web-ext lint

# Build extension
web-ext build
```

## 📊 Browser Compatibility

| Feature | Firefox 109+ | Firefox ESR 115+ |
|---------|-------------|------------------|
| Sidebar | ✅ | ✅ |
| Screenshots | ✅ | ✅ |
| AWS SDK | ✅ | ✅ |
| Bedrock API | ✅ | ✅ |
| S3 Upload | ✅ | ✅ |
| Cognito Auth | ✅ | ✅ |
| Workflows | ✅ | ✅ |

## 🔄 Differences from Chrome Version

### What's Different

1. **Manifest V2** instead of V3
2. **Sidebar** instead of side panel
3. **Background script** instead of service worker
4. **browser.* API** namespace
5. **Popup** for quick access

### What's the Same

- All core functionality
- AWS integration
- AI capabilities
- Workflow system
- Storage structure
- Security features

## 📝 Development Notes

### Building for Firefox

```bash
# Lint the extension
web-ext lint

# Run in Firefox
web-ext run

# Build for distribution
web-ext build

# Sign for distribution
web-ext sign --api-key=YOUR_KEY --api-secret=YOUR_SECRET
```

### Debugging

1. **Open Browser Console**: `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Shift+J` (Mac)
2. **Inspect Extension**: `about:debugging` → This Firefox → Inspect
3. **View Logs**: Background script logs appear in Browser Console
4. **Debug Sidebar**: Right-click sidebar → Inspect

### Common Issues

**Extension won't load:**
- Check manifest.json syntax
- Verify all file paths exist
- Check browser console for errors

**Screenshots fail:**
- Verify `tabs` and `activeTab` permissions
- Check if page is fully loaded
- Try increasing wait times

**AWS calls fail:**
- Verify CORS configuration
- Check network tab for errors
- Ensure credentials are valid

## 🆘 Support

For issues specific to Firefox version:
1. Check Firefox Browser Console for errors
2. Verify manifest.json is valid
3. Test with `web-ext lint`
4. Compare with Chrome version behavior

For general issues:
- Check main README.md
- Review deployment/README.md
- Check AWS service status

## 📝 License

Same license as Chrome version - proprietary software for SOX compliance evidence collection.

---

**Firefox Version**: 1.0  
**Minimum Firefox**: 109.0  
**Recommended Firefox**: 115+ (ESR)  
**Last Updated**: January 2026
