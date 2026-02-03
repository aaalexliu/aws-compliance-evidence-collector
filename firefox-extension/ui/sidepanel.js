document.addEventListener('DOMContentLoaded', async function() {
  // Initialize tools framework
  window.evidenceTools = new EvidenceTools({
    ui: {
      showNotification: (message, type) => {
        console.log(`${type.toUpperCase()}: ${message}`);
        // Could add visual notifications here
      }
    }
  });

  // Initialize chat logging
  let chatHistory = [];
  let s3Manager = null; // Initialize after S3Manager class is defined
  let currentUsername = '';
  
  // Track active workflow report for EmailReport tool - expose globally
  window.activeWorkflowReport = null;

  // Function to save chat after each message
  async function saveChatEvidence() {
    if (chatHistory.length > 0 && currentUsername) {
      try {
        await s3Manager.saveChatToS3(chatHistory, currentUsername);
        console.log('✅ Chat evidence saved to S3');
      } catch (error) {
        console.error('❌ Failed to save chat evidence:', error);
      }
    }
  }
  
  // Check authentication first
  const session = await browser.storage.local.get(['credentials', 'username']);
  if (!session.credentials) {
    window.location.href = 'auth.html';
    return;
  }

  // Display username and initialize chat logging (only if userInfo element exists)
  currentUsername = session.username;
  const userInfoElement = document.getElementById('userInfo');
  if (userInfoElement) {
    userInfoElement.textContent = `Logged in as: ${currentUsername}`;
  }

  // Import CognitoAuth class - Make it globally available
  class CognitoAuth {
    constructor() {
      this.cognitoConfig = null;
    }

    async getCurrentPageInfo() {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        return `${tab.title} (${tab.url})`;
      } catch (error) {
        return 'Unknown page';
      }
    }

    async callBedrockAPI(message) {
      // Call real Nova Pro API using AWS SDK
      console.log('Calling Nova Pro API for:', message);
      
      try {
        const config = await browser.storage.local.get(['cognitoConfig']);
        const session = await browser.storage.local.get(['credentials']);
        
        if (!session.credentials || !config.cognitoConfig) {
          throw new Error('Not authenticated or config missing');
        }

        const credentials = session.credentials;
        const region = config.cognitoConfig.region;
        const s3BucketName = config.cognitoConfig.s3BucketName;
        
        // Fetch system prompt from S3 using AWS SDK
        let systemPrompt;
        try {
          console.log('Fetching prompt from S3:', s3BucketName, 'config/prompts/compliance-assistant-prompt.txt');
          
          // Configure AWS SDK with Cognito credentials
          AWS.config.update({
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretKey,
            sessionToken: credentials.SessionToken,
            region: region
          });

          const s3 = new AWS.S3();
          
          const getParams = {
            Bucket: s3BucketName,
            Key: 'config/prompts/compliance-assistant-prompt.txt'
          };
          
          const result = await s3.getObject(getParams).promise();
          systemPrompt = result.Body.toString('utf-8');
          console.log('Loaded system prompt from S3, length:', systemPrompt.length);
        } catch (error) {
          console.error('Failed to load prompt from S3:', error);
          console.error('Bucket:', s3BucketName, 'Region:', region);
          throw new Error('System prompt not available. Please ensure prompts are uploaded to S3.');
        }
        
        // Prepare Bedrock request - Compliance-focused with tools for evidence collection
        const requestBody = {
          messages: [
            {
              role: "user",
              content: [{ text: message }]
            }
          ],
          inferenceConfig: {
            maxTokens: 1000,
            temperature: 0.1
          },
          system: [
            {
              text: systemPrompt
            }
          ]
        };

        // Add tools for compliance evidence collection
        if (window.evidenceTools) {
          const tools = window.evidenceTools.getTools();
          if (tools.length > 0) {
            requestBody.toolConfig = {
              tools: tools.map(tool => ({
                toolSpec: {
                  name: tool.tool_name,
                  description: tool.description,
                  inputSchema: {
                    json: JSON.parse(tool.inputSchema.json)
                  }
                }
              }))
            };
          }
        }

        // Configure AWS SDK with Cognito credentials
        AWS.config.update({
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretKey,
          sessionToken: credentials.SessionToken,
          region: region
        });

        // Use AWS SDK's request signing directly (reverted to working version)
        const endpoint = new AWS.Endpoint(`https://bedrock-runtime.${region}.amazonaws.com`);
        
        const request = new AWS.HttpRequest(endpoint, region);
        request.method = 'POST';
        request.path = '/model/amazon.nova-pro-v1:0/invoke';
        request.body = JSON.stringify(requestBody);
        request.headers['Content-Type'] = 'application/json';
        request.headers['Host'] = endpoint.host;

        // Sign the request using AWS SDK's signer
        const signer = new AWS.Signers.V4(request, 'bedrock');
        signer.addAuthorization(AWS.config.credentials, new Date());

        // Make the request using fetch with signed headers
        const response = await fetch(`https://${request.headers['Host']}${request.path}`, {
          method: request.method,
          headers: request.headers,
          body: request.body
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Bedrock API error: ${response.status} - ${errorText}`);
        }

        const responseBody = await response.json();
        console.log('=== NOVA PRO RESPONSE ===');
        console.log(JSON.stringify(responseBody, null, 2));
        
        // Return full response for tool handling
        return responseBody;
        
      } catch (error) {
        console.error('Nova Pro API error:', error);
        return `I'm having trouble connecting to Nova Pro right now. Error: ${error.message}`;
      }
    }
  }

  // Make CognitoAuth globally available for Nova Pro agent
  window.CognitoAuth = CognitoAuth;

  // S3Manager class for screenshot uploads and chat logging
  class S3Manager {
    constructor() {
      this.config = null;
      this.credentials = null;
      this.todayFolder = null;
      this.sessionId = this.generateSessionId();
    }

    generateSessionId() {
      return 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    async initialize() {
      const config = await browser.storage.local.get(['cognitoConfig']);
      const session = await browser.storage.local.get(['credentials']);
      
      this.config = config.cognitoConfig;
      this.credentials = session.credentials;
      
      if (!this.config || !this.credentials) {
        throw new Error('Configuration or credentials missing');
      }

      const today = new Date();
      this.todayFolder = `evidence/${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
      
      return this.todayFolder;
    }

    sanitizeForFilename(text) {
      // Convert to lowercase, replace spaces with hyphens, remove special chars
      return text
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 50); // Limit length
    }

    generateFilename(url, stepDescription = 'screenshot', workflowName = null) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const domain = new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '-');
      const sanitizedDescription = this.sanitizeForFilename(stepDescription);
      return `${timestamp}_${domain}_${sanitizedDescription}.png`;
    }

    async uploadScreenshot(screenshotBase64, url, stepDescription = 'screenshot', workflowName = null) {
      await this.initialize();
      
      // Build path with workflow folder if provided
      let uploadPath = this.todayFolder;
      if (workflowName) {
        const sanitizedWorkflow = this.sanitizeForFilename(workflowName);
        uploadPath = `${uploadPath}/${sanitizedWorkflow}`;
      }
      
      const filename = this.generateFilename(url, stepDescription, workflowName);
      const key = `${uploadPath}/${filename}`;
      
      // Remove data URL prefix if present
      let base64Data = screenshotBase64.replace(/^data:image\/[a-zA-Z]*;base64,/, '');
      
      // Validate base64 string
      if (!base64Data || base64Data === screenshotBase64) {
        throw new Error('Invalid data URL format - missing base64 prefix');
      }
      
      // Convert to Uint8Array for AWS SDK
      let byteArray;
      try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        byteArray = new Uint8Array(byteNumbers);
      } catch (base64Error) {
        throw new Error(`Base64 decode error: ${base64Error.message}. Data URL length: ${screenshotBase64.length}`);
      }

      try {
        console.log('Using AWS SDK for S3 upload:', {
          bucket: this.config.s3BucketName,
          key: key,
          region: this.config.region
        });

        // Configure AWS SDK with Cognito credentials (reverted to working version)
        AWS.config.update({
          accessKeyId: this.credentials.AccessKeyId,
          secretAccessKey: this.credentials.SecretKey,
          sessionToken: this.credentials.SessionToken,
          region: this.config.region
        });

        // Create S3 service object
        const s3 = new AWS.S3();

        // Upload parameters
        const uploadParams = {
          Bucket: this.config.s3BucketName,
          Key: key,
          Body: byteArray,
          ContentType: 'image/png'
        };

        // Upload to S3
        const result = await s3.upload(uploadParams).promise();
        
        console.log('S3 upload successful:', result.Location);

        return {
          success: true,
          url: result.Location,
          key: key,
          filename: filename
        };

      } catch (error) {
        console.error('S3 Upload error message:', error.message);
        console.error('S3 Upload bucket:', this.config?.s3BucketName);
        console.error('S3 Upload region:', this.config?.region);
        console.error('S3 Upload hasCredentials:', !!this.credentials);
        console.error('S3 Upload full error:', error);
        throw new Error(`S3 upload error: ${error.message}`);
      }
    }

    async saveChatToS3(chatHistory, username) {
      await this.initialize();
      
      const filename = `chat-evidence-${username}-${this.sessionId}.json`;
      const key = `${this.todayFolder}/chat-logs/${filename}`;
      
      const chatData = {
        sessionId: this.sessionId,
        user: username,
        lastUpdated: new Date().toISOString(),
        chatHistory: chatHistory,
        metadata: {
          browser: 'Chrome',
          extension_version: '1.0',
          compliance_context: 'evidence_collection',
          session_start: this.sessionStartTime || new Date().toISOString()
        }
      };
      
      try {
        const s3 = new AWS.S3();
        
        const uploadParams = {
          Bucket: this.config.s3BucketName,
          Key: key,
          Body: JSON.stringify(chatData, null, 2),
          ContentType: 'application/json',
          ServerSideEncryption: 'AES256'
        };
        
        const result = await s3.upload(uploadParams).promise();
        console.log('Chat saved to S3:', result.Location);
        
        return { filename, s3Url: result.Location };
      } catch (error) {
        console.error('Chat save error:', error);
        throw new Error(`Failed to save chat: ${error.message}`);
      }
    }

    async saveWorkflowLog(workflowLog) {
      await this.initialize();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedWorkflow = this.sanitizeForFilename(workflowLog.workflowName);
      const filename = `workflow-${sanitizedWorkflow}-${workflowLog.username}-${timestamp}.json`;
      const key = `chat-logs/${this.todayFolder.split('/').slice(1).join('/')}/${filename}`;
      
      try {
        // Configure AWS SDK
        AWS.config.update({
          accessKeyId: this.credentials.AccessKeyId,
          secretAccessKey: this.credentials.SecretKey,
          sessionToken: this.credentials.SessionToken,
          region: this.config.region
        });

        const s3 = new AWS.S3();
        
        const uploadParams = {
          Bucket: this.config.s3BucketName,
          Key: key,
          Body: JSON.stringify(workflowLog, null, 2),
          ContentType: 'application/json'
        };

        const result = await s3.upload(uploadParams).promise();
        console.log('Workflow log saved to S3:', result.Location);
        
        return { filename, s3Url: result.Location };
      } catch (error) {
        console.error('Workflow log save error:', error);
        throw new Error(`Failed to save workflow log: ${error.message}`);
      }
    }

    async saveReport(reportHTML, workflowName) {
      await this.initialize();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedWorkflow = this.sanitizeForFilename(workflowName);
      const filename = `${sanitizedWorkflow}-report-${timestamp}.html`;
      
      // Create reports folder structure: reports/YYYY/MM/DD/
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const key = `reports/${year}/${month}/${day}/${filename}`;
      
      try {
        // Configure AWS SDK
        AWS.config.update({
          accessKeyId: this.credentials.AccessKeyId,
          secretAccessKey: this.credentials.SecretKey,
          sessionToken: this.credentials.SessionToken,
          region: this.config.region
        });

        const s3 = new AWS.S3();
        
        const uploadParams = {
          Bucket: this.config.s3BucketName,
          Key: key,
          Body: reportHTML,
          ContentType: 'text/html'
        };

        const result = await s3.upload(uploadParams).promise();
        console.log('Report saved to S3:', result.Location);
        
        return result.Location;
      } catch (error) {
        console.error('Report save error:', error);
        throw new Error(`Failed to save report: ${error.message}`);
      }
    }

    async loadWorkflowsFromS3() {
      await this.initialize();
      
      const key = 'config/workflows/user-workflows.json';
      
      try {
        // Configure AWS SDK
        AWS.config.update({
          accessKeyId: this.credentials.AccessKeyId,
          secretAccessKey: this.credentials.SecretKey,
          sessionToken: this.credentials.SessionToken,
          region: this.config.region
        });

        const s3 = new AWS.S3();
        
        const getParams = {
          Bucket: this.config.s3BucketName,
          Key: key
        };

        const result = await s3.getObject(getParams).promise();
        const workflows = JSON.parse(result.Body.toString('utf-8'));
        console.log('Workflows loaded from S3:', workflows.length);
        
        return workflows;
      } catch (error) {
        if (error.code === 'NoSuchKey') {
          console.log('No workflows found in S3 (first time use)');
          return null; // First time use
        }
        console.error('Failed to load workflows from S3:', error);
        throw error;
      }
    }

    async saveWorkflowsToS3(workflows) {
      await this.initialize();
      
      const key = 'config/workflows/user-workflows.json';
      
      try {
        // Configure AWS SDK
        AWS.config.update({
          accessKeyId: this.credentials.AccessKeyId,
          secretAccessKey: this.credentials.SecretKey,
          sessionToken: this.credentials.SessionToken,
          region: this.config.region
        });

        const s3 = new AWS.S3();
        
        // Create backup of existing workflows before overwriting
        try {
          await this.createWorkflowBackup(s3);
        } catch (backupError) {
          console.warn('Failed to create backup (file may not exist yet):', backupError.message);
          // Continue with save even if backup fails (e.g., first time save)
        }
        
        const uploadParams = {
          Bucket: this.config.s3BucketName,
          Key: key,
          Body: JSON.stringify(workflows, null, 2),
          ContentType: 'application/json'
        };

        const result = await s3.upload(uploadParams).promise();
        console.log('Workflows saved to S3:', result.Location);
        
        return { success: true, location: result.Location };
      } catch (error) {
        console.error('Failed to save workflows to S3:', error);
        throw new Error(`Failed to save workflows: ${error.message}`);
      }
    }

    async createWorkflowBackup(s3) {
      const sourceKey = 'config/workflows/user-workflows.json';
      
      try {
        // Get existing workflows file
        const getParams = {
          Bucket: this.config.s3BucketName,
          Key: sourceKey
        };
        
        const existingFile = await s3.getObject(getParams).promise();
        
        // Create timestamp for backup filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // YYYY-MM-DDTHH-MM-SS
        const backupKey = `config/workflows/backups/user-workflows-${timestamp}.json`;
        
        // Save backup
        const backupParams = {
          Bucket: this.config.s3BucketName,
          Key: backupKey,
          Body: existingFile.Body,
          ContentType: 'application/json'
        };
        
        await s3.upload(backupParams).promise();
        console.log('✅ Workflow backup created:', backupKey);
        
      } catch (error) {
        // If file doesn't exist (NoSuchKey), it's likely the first save
        if (error.code === 'NoSuchKey') {
          console.log('No existing workflows to backup (first time save)');
        } else {
          throw error;
        }
      }
    }
  }

  // Make S3Manager globally accessible for tools
  window.S3Manager = S3Manager;

  // Initialize S3Manager for chat logging
  s3Manager = new S3Manager();

  // Screenshot stitching function
  async function stitchScreenshots(screenshots, pageInfo) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      let loadedImages = 0;
      const images = [];
      
      screenshots.forEach((screenshot, index) => {
        const img = new Image();
        img.onload = () => {
          images[index] = { img, index: screenshot.index };
          loadedImages++;
          
          if (loadedImages === screenshots.length) {
            // Sort images by their original index
            images.sort((a, b) => a.index - b.index);
            
            // Use actual image dimensions - simple sequential placement
            const firstImg = images[0].img;
            canvas.width = firstImg.width;
            canvas.height = firstImg.height * images.length;
            
            console.log(`Canvas size: ${canvas.width}x${canvas.height}, Image size: ${firstImg.width}x${firstImg.height}, Images: ${images.length}`);
            
            // Draw images sequentially - no overlap
            images.forEach((imageData, i) => {
              const yPosition = i * firstImg.height;
              console.log(`Drawing image ${i} at y position ${yPosition}`);
              ctx.drawImage(imageData.img, 0, yPosition);
            });
            
            const stitchedDataUrl = canvas.toDataURL('image/png', 1.0);
            console.log('Stitched screenshot completed');
            resolve(stitchedDataUrl);
          }
        };
        img.src = screenshot.dataUrl;
      });
    });
  }

  const chatArea = document.getElementById('chatArea');
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');

  function convertMarkdownToHTML(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function displayScreenshot(screenshotData) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    
    const img = document.createElement('img');
    img.src = screenshotData;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.border = '1px solid #ddd';
    img.style.borderRadius = '4px';
    img.style.marginTop = '8px';
    
    messageDiv.appendChild(img);
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function addMessage(content, type, screenshot = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    const htmlContent = convertMarkdownToHTML(content);
    messageDiv.innerHTML = `
      <div>${htmlContent}</div>
    `;
    
    if (screenshot) {
      const img = document.createElement('img');
      img.src = screenshot;
      img.style.maxWidth = '100%';
      img.style.marginTop = '10px';
      img.style.borderRadius = '8px';
      messageDiv.appendChild(img);
    }
    
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  // Intelligent Error Recovery for chat commands
  async function handleClickErrorRecovery(failedElement, tabId) {
    try {
      addMessage('🤖 Analyzing page for alternatives...', 'assistant');
      
      // Get all clickable elements
      let elementsResponse;
      try {
        elementsResponse = await browser.tabs.sendMessage(tabId, {
          action: 'getAllClickableElements'
        });
      } catch (msgError) {
        console.error('Failed to get elements:', msgError);
        addMessage('Could not analyze page elements (page may need refresh)', 'assistant');
        return;
      }
      
      if (!elementsResponse || !elementsResponse.elements || elementsResponse.elements.length === 0) {
        addMessage('No clickable elements found on page', 'assistant');
        return;
      }
      
      addMessage(`📋 Found ${elementsResponse.elements.length} clickable elements on page`, 'assistant');
      
      // Show top 10 unique elements found
      const uniqueElements = elementsResponse.elements
        .filter((el, idx, arr) => arr.findIndex(e => e.text === el.text) === idx)
        .slice(0, 10);
      
      let elementsList = '\n**Top 10 clickable elements on page:**\n';
      uniqueElements.forEach((el, idx) => {
        const type = el.tag === 'a' ? 'link' : el.tag === 'button' ? 'button' : el.tag;
        elementsList += `${idx + 1}. **${el.text}** (${type})\n`;
      });
      addMessage(elementsList, 'assistant');
      
      // Use simple text similarity matching instead of Nova Pro
      const failedLower = failedElement.toLowerCase();
      const matches = elementsResponse.elements
        .map(el => ({
          ...el,
          similarity: window.calculateSimilarity(failedLower, el.text.toLowerCase())
        }))
        .filter(el => el.similarity > 0.3) // At least 30% similar
        .sort((a, b) => b.similarity - a.similarity)
        // Remove duplicates by text
        .filter((el, idx, arr) => arr.findIndex(e => e.text === el.text) === idx)
        .slice(0, 3);
      
      if (matches.length === 0) {
        addMessage('\n❌ No similar elements found based on text matching.', 'assistant');
        return;
      }
      
      let matchesList = `\n🤖 **Most similar to "${failedElement}":**\n`;
      matches.forEach((match, idx) => {
        matchesList += `${idx + 1}. **${match.text}** (${Math.round(match.similarity * 100)}% match)\n`;
      });
      addMessage(matchesList, 'assistant');
      
      // Create interactive buttons
      const recoveryDiv = document.createElement('div');
      recoveryDiv.className = 'message assistant';
      recoveryDiv.innerHTML = `
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;">
          ${matches.map(match => 
            `<button class="recovery-btn" data-element="${match.text}" 
              style="padding: 8px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
              Try: ${match.text}
            </button>`
          ).join('')}
        </div>
      `;
      
      chatArea.appendChild(recoveryDiv);
      chatArea.scrollTop = chatArea.scrollHeight;
      
      // Add click handlers
      recoveryDiv.querySelectorAll('.recovery-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const element = btn.getAttribute('data-element');
          recoveryDiv.remove();
          
          // Try clicking the suggested element
          addMessage(`Trying to click: ${element}`, 'assistant');
          try {
            const response = await browser.tabs.sendMessage(tabId, {
              action: 'clickElement',
              description: element
            });
            
            if (response.success) {
              addMessage(`✅ ${response.message}`, 'assistant');
            } else {
              addMessage(`❌ ${response.error}`, 'assistant');
            }
          } catch (error) {
            addMessage(`❌ Failed: ${error.message}`, 'assistant');
          }
        });
      });
    } catch (error) {
      console.error('Error recovery failed:', error);
      addMessage(`Error recovery failed: ${error.message}`, 'assistant');
    }
  }

  // Show generate report button after workflow completion
  function showGenerateReportButton(workflowName, logData) {
    const reportDiv = document.createElement('div');
    reportDiv.className = 'message assistant';
    reportDiv.innerHTML = `
      <div style="margin-top: 12px;">
        <button id="generateReportBtn" 
          style="padding: 12px 24px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(102,126,234,0.4);">
          📊 Generate Evidence Report
        </button>
      </div>
    `;
    
    chatArea.appendChild(reportDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
    
    // Add click handler
    document.getElementById('generateReportBtn').addEventListener('click', async () => {
      document.getElementById('generateReportBtn').disabled = true;
      document.getElementById('generateReportBtn').textContent = '⏳ Generating report...';
      
      try {
        await generateWorkflowReport(workflowName, logData);
      } catch (error) {
        addMessage(`❌ Report generation failed: ${error.message}`, 'assistant');
        document.getElementById('generateReportBtn').disabled = false;
        document.getElementById('generateReportBtn').textContent = '📊 Generate Evidence Report';
      }
    });
  }

  // Generate workflow report with Nova Pro summary
  async function generateWorkflowReport(workflowName, logData) {
    addMessage('🤖 Analyzing workflow execution...', 'assistant');
    
    // Prepare workflow summary for Nova Pro
    const workflowSummary = `
Workflow: ${logData.workflowName}
User: ${logData.username}
Start Time: ${new Date(logData.startTime).toLocaleString()}
End Time: ${new Date(logData.endTime).toLocaleString()}
Duration: ${Math.round((new Date(logData.endTime) - new Date(logData.startTime)) / 1000)} seconds
Status: ${logData.status}

Steps Executed:
${logData.steps.map((step, idx) => `
${idx + 1}. ${step.action.toUpperCase()}: ${step.description}
   Status: ${step.status}
   Duration: ${step.endTime ? Math.round((new Date(step.endTime) - new Date(step.startTime)) / 1000) : 'N/A'} seconds
   ${step.error ? `Error: ${step.error}` : ''}
`).join('\n')}

Please analyze this workflow execution and provide:
1. Executive Summary (2-3 sentences about what was accomplished)
2. Key Findings (any issues, successes, or notable observations)
3. Compliance Status (whether all steps completed successfully)
4. Recommendations (any suggestions for improvement)

Format your response as:
EXECUTIVE_SUMMARY: [your summary]
KEY_FINDINGS: [your findings]
COMPLIANCE_STATUS: [status]
RECOMMENDATIONS: [your recommendations]
`;

    // Get Nova Pro analysis
    const analysis = await novaProAgent.simpleChat(workflowSummary);
    
    // Parse Nova Pro response
    const executiveSummary = analysis.match(/EXECUTIVE_SUMMARY:\s*(.+?)(?=KEY_FINDINGS:|$)/s)?.[1]?.trim() || 'Workflow executed successfully.';
    const keyFindings = analysis.match(/KEY_FINDINGS:\s*(.+?)(?=COMPLIANCE_STATUS:|$)/s)?.[1]?.trim() || 'All steps completed as expected.';
    const complianceStatus = analysis.match(/COMPLIANCE_STATUS:\s*(.+?)(?=RECOMMENDATIONS:|$)/s)?.[1]?.trim() || 'Compliant';
    const recommendations = analysis.match(/RECOMMENDATIONS:\s*(.+?)$/s)?.[1]?.trim() || 'No additional recommendations.';
    
    // Generate HTML report
    const reportHTML = generateReportHTML(logData, {
      executiveSummary,
      keyFindings,
      complianceStatus,
      recommendations
    });
    
    // Save to S3
    addMessage('💾 Saving report to S3...', 'assistant');
    const s3Manager = new S3Manager();
    const reportUrl = await s3Manager.saveReport(reportHTML, workflowName);
    
    addMessage(`✅ Report generated successfully!\n📄 Saved to: ${reportUrl}`, 'assistant');
    
    // Store as active report for EmailReport tool - save to storage
    window.activeWorkflowReport = {
      workflowName: logData.workflowName,
      logData: logData,
      reportHTML: reportHTML,
      reportUrl: reportUrl,
      timestamp: Date.now()
    };
    
    // Also store in session storage for cross-context access
    await browser.storage.local.set({ 
      activeWorkflowReport: window.activeWorkflowReport 
    });
    
    // Automatically send email
    await window.sendReportEmail(reportHTML, workflowName, reportUrl);
  }

  // Send report via email using SES
  // Send report via email using SES - expose globally for EmailReport tool
  window.sendReportEmail = async function(reportHTML, workflowName, reportUrl, recipientEmail = null) {
    addMessage('📧 Sending email...', 'assistant');
    
    // Get user email from Cognito
    const session = await browser.storage.local.get(['credentials', 'userEmail', 'accessToken']);
    const config = await browser.storage.local.get(['cognitoConfig']);
    
    if (!session.credentials || !config.cognitoConfig) {
      throw new Error('Not authenticated');
    }
    
    // Get user email from Cognito user attributes
    let userEmail = session.userEmail;
    if (!userEmail && session.accessToken) {
      // Fetch from Cognito if not in session
      try {
        const userUrl = `https://cognito-idp.${config.cognitoConfig.region}.amazonaws.com/`;
        const getUserRequest = { AccessToken: session.accessToken };
        
        console.log('Fetching user email from Cognito...');
        const response = await fetch(userUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser'
          },
          body: JSON.stringify(getUserRequest)
        });
        
        const userData = await response.json();
        console.log('Cognito GetUser response:', userData);
        
        const emailAttr = userData.UserAttributes?.find(attr => attr.Name === 'email');
        userEmail = emailAttr?.Value;
        
        // Cache it
        if (userEmail) {
          await browser.storage.local.set({ userEmail });
        }
      } catch (error) {
        console.error('Failed to get user email:', error);
        addMessage(`⚠️ Could not fetch email from Cognito: ${error.message}`, 'assistant');
      }
    }
    
    // Use provided recipient or default to user's email
    const finalRecipient = recipientEmail || userEmail;
    
    if (!finalRecipient) {
      throw new Error('Could not retrieve user email from Cognito. Please ensure your Cognito user has an email attribute.');
    }
    
    // Prepare email
    const emailSubject = `Evidence Report: ${workflowName}`;
    const emailBody = reportHTML;
    
    // Send via SES
    const AWS_SDK = window.AWS;
    AWS_SDK.config.update({
      accessKeyId: session.credentials.AccessKeyId,
      secretAccessKey: session.credentials.SecretKey,
      sessionToken: session.credentials.SessionToken,
      region: config.cognitoConfig.region
    });
    
    const ses = new AWS_SDK.SES();
    
    const params = {
      Source: userEmail || finalRecipient,
      Destination: {
        ToAddresses: [finalRecipient]
      },
      Message: {
        Subject: {
          Data: emailSubject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: emailBody,
            Charset: 'UTF-8'
          }
        }
      }
    };
    
    await ses.sendEmail(params).promise();
    
    addMessage(`✅ Report emailed to: ${finalRecipient}`, 'assistant');
  }

  // Generate HTML report template
  function generateReportHTML(logData, analysis) {
    const duration = Math.round((new Date(logData.endTime) - new Date(logData.startTime)) / 1000);
    const successSteps = logData.steps.filter(s => s.status === 'success').length;
    const totalSteps = logData.steps.length;
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Workflow Evidence Report - ${logData.workflowName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 30px; }
    h1 { color: #1f2937; margin: 0 0 10px 0; font-size: 28px; }
    .subtitle { color: #6b7280; font-size: 14px; }
    .section { margin: 30px 0; }
    .section-title { color: #667eea; font-size: 18px; font-weight: 600; margin-bottom: 15px; border-left: 4px solid #667eea; padding-left: 12px; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
    .info-item { background: #f9fafb; padding: 15px; border-radius: 8px; }
    .info-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
    .info-value { font-size: 16px; color: #1f2937; font-weight: 500; }
    .status-badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .status-success { background: #d1fae5; color: #065f46; }
    .status-failed { background: #fee2e2; color: #991b1b; }
    .steps-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .steps-table th { background: #f9fafb; padding: 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
    .steps-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .step-success { color: #059669; }
    .step-failed { color: #dc2626; }
    .analysis-box { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 8px; margin: 15px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Workflow Evidence Report</h1>
      <div class="subtitle">Generated on ${new Date().toLocaleString()}</div>
    </div>

    <div class="section">
      <div class="section-title">Executive Summary</div>
      <div class="analysis-box">${analysis.executiveSummary}</div>
    </div>

    <div class="section">
      <div class="section-title">Workflow Information</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Workflow Name</div>
          <div class="info-value">${logData.workflowName}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Executed By</div>
          <div class="info-value">${logData.username}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Start Time</div>
          <div class="info-value">${new Date(logData.startTime).toLocaleString()}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Duration</div>
          <div class="info-value">${duration} seconds</div>
        </div>
        <div class="info-item">
          <div class="info-label">Status</div>
          <div class="info-value">
            <span class="status-badge status-${logData.status === 'completed' ? 'success' : 'failed'}">
              ${logData.status}
            </span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">Steps Completed</div>
          <div class="info-value">${successSteps} / ${totalSteps}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Execution Steps</div>
      <table class="steps-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Action</th>
            <th>Description</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${logData.steps.map((step, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><strong>${step.action.toUpperCase()}</strong></td>
              <td>${step.description}</td>
              <td>${step.endTime ? Math.round((new Date(step.endTime) - new Date(step.startTime)) / 1000) : 'N/A'}s</td>
              <td class="step-${step.status === 'success' ? 'success' : 'failed'}">
                ${step.status === 'success' ? '✓' : '✗'} ${step.status}
                ${step.error ? `<br><small>${step.error}</small>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">📸 Evidence Screenshots</div>
      ${logData.steps.filter(s => s.screenshotUrl).length > 0 ? `
        <div class="info-item" style="margin: 15px 0;">
          <div class="info-label">Screenshots Location</div>
          <div class="info-value">
            <a href="https://s3.console.aws.amazon.com/s3/buckets/${logData.s3Bucket || 'evidence-bucket'}?prefix=evidence/${new Date(logData.startTime).getFullYear()}/${String(new Date(logData.startTime).getMonth() + 1).padStart(2, '0')}/${String(new Date(logData.startTime).getDate()).padStart(2, '0')}/${logData.workflowName.toLowerCase().replace(/\s+/g, '-')}/&region=${logData.region || 'us-east-1'}" 
               target="_blank" 
               style="color: #3b82f6; text-decoration: none; font-size: 14px;">
              📁 View Screenshots in S3 →
            </a>
          </div>
          <div style="margin-top: 10px; font-size: 12px; color: #6b7280;">
            ${logData.steps.filter(s => s.screenshotUrl).length} screenshot(s) captured during workflow execution
          </div>
        </div>
      ` : '<p style="color: #6b7280; font-style: italic;">No screenshots captured during this workflow execution.</p>'}
    </div>

    <div class="section">
      <div class="section-title">Key Findings</div>
      <div class="analysis-box">${analysis.keyFindings}</div>
    </div>

    <div class="section">
      <div class="section-title">Compliance Status</div>
      <div class="analysis-box">${analysis.complianceStatus}</div>
    </div>

    <div class="section">
      <div class="section-title">Recommendations</div>
      <div class="analysis-box">${analysis.recommendations}</div>
    </div>

    <div class="footer">
      <p>This report was automatically generated by the Browser Evidence Collector</p>
      <p>Workflow: ${logData.workflowName} | User: ${logData.username}</p>
    </div>
  </div>
</body>
</html>`;
  }

  function addMessage(content, type, screenshot = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    const htmlContent = convertMarkdownToHTML(content);
    messageDiv.innerHTML = `
      <div>${htmlContent}</div>
      ${screenshot ? `<img src="${screenshot}" class="screenshot" onclick="downloadScreenshot('${screenshot}')">` : ''}
    `;
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  async function callNovaProAPI(message) {
    try {
      const config = await browser.storage.local.get(['cognitoConfig']);
      const session = await browser.storage.local.get(['credentials']);
      
      if (!config.cognitoConfig || !session.credentials) {
        return 'Authentication expired. Please refresh and login again.';
      }

      const auth = new CognitoAuth();
      auth.cognitoConfig = config.cognitoConfig;
      
      return await auth.callBedrockAPI(message);
    } catch (error) {
      return `Error calling Nova Pro: ${error.message}`;
    }
  }

  async function handleCommand(command) {
    addMessage(command, 'user');
    
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      
      if (command.toLowerCase().startsWith('navigate ')) {
        const url = command.substring(9).trim();
        let fullUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          fullUrl = 'https://' + url;
        }
        
        try {
          await browser.tabs.update(tab.id, { url: fullUrl });
          addMessage(`Navigating to ${url}`, 'assistant');
        } catch (error) {
          addMessage(`Navigation failed: ${error.message}`, 'assistant');
        }
        
      } else if (command.toLowerCase().includes('scroll')) {
        const direction = command.toLowerCase().includes('up') ? 'up' : 'down';
        await browser.tabs.sendMessage(tab.id, { 
          action: 'scroll', 
          direction: direction 
        });
        addMessage('Scrolled page', 'assistant');
        
      } else if (command.toLowerCase().startsWith('click ')) {
        const element = command.substring(6).trim();
        
        try {
          addMessage('Looking for element to click...', 'assistant');
          
          const response = await browser.tabs.sendMessage(tab.id, {
            action: 'clickElement',
            description: element
          });
          
          if (response.success) {
            addMessage(`${response.message}`, 'assistant');
            
            // Auto-screenshot after successful click
            const screenshot = await browser.tabs.captureVisibleTab(null, { format: 'png' });
            addMessage('[CAMERA] Auto-screenshot after click, uploading...', 'assistant', screenshot);
            
            try {
              const s3Manager = new S3Manager();
              const result = await s3Manager.uploadScreenshot(screenshot, tab.url, 'auto-click');
              addMessage(`Uploaded: ${result.filename}`, 'assistant');
            } catch (error) {
              addMessage(`S3 upload failed: ${error.message}`, 'assistant');
            }
          } else {
            // Click failed - trigger intelligent error recovery
            addMessage(`❌ ${response.error}`, 'assistant');
            await handleClickErrorRecovery(element, tab.id);
          }
        } catch (error) {
          addMessage(`❌ Click failed: ${error.message}`, 'assistant');
          await handleClickErrorRecovery(element, tab.id);
        }
        
      } else if (command.toLowerCase().startsWith('find ')) {
        const description = command.substring(5).trim();
        
        const response = await browser.tabs.sendMessage(tab.id, {
          action: 'findElements',
          description: description
        });
        
        if (response.success && response.elements.length > 0) {
          let message = `Found ${response.elements.length} elements:\n`;
          response.elements.forEach((el, i) => {
            message += `${i+1}. ${el.tagName}: "${el.text}" (score: ${el.score})\n`;
          });
          addMessage(message, 'assistant');
        } else {
          addMessage(`No elements found matching "${description}"`, 'assistant');
        }
        
      } else {
        // Send to Nova Pro for AI response
        addMessage('Asking Nova Pro...', 'assistant');
        const aiResponse = await callNovaProAPI(command);
        // Replace the "asking" message with actual response
        const messages = chatArea.querySelectorAll('.message.assistant');
        const lastMessage = messages[messages.length - 1];
        const htmlResponse = convertMarkdownToHTML(aiResponse);
        lastMessage.innerHTML = `<div>${htmlResponse}</div>`;
      }
      
    } catch (error) {
      addMessage(`Error: ${error.message}`, 'assistant');
    }
  }

  // Event listeners - Updated to use Nova Pro for everything (only if elements exist)
  if (sendButton) {
    sendButton.addEventListener('click', async () => {
      const message = messageInput.value.trim();
      if (message) {
        await sendMessageWithNovaPro(message);
        messageInput.value = '';
      }
    });
  }

  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendButton.click();
      }
    });
  }

  // Initialize Nova Pro agent for both manual and automation
  let novaProAgent = null;
  
  // Initialize Nova Pro agent
  async function initializeNovaProAgent() {
    try {
      if (window.NovaProAgent) {
        novaProAgent = new window.NovaProAgent();
        console.log('Nova Pro agent initialized for manual and automation');
      }
    } catch (error) {
      console.error('Failed to initialize Nova Pro agent:', error);
    }
  }

  // Send message using Nova Pro agent
  async function sendMessageWithNovaPro(message) {
    if (!message.trim()) return;

    addMessage(message, 'user');
    
    // Add to chat history for evidence logging
    chatHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Check for workflow commands first
    if (message.toLowerCase().startsWith('show workflow steps ')) {
      const workflowName = message.substring(20).trim();
      if (workflowManager) {
        const workflow = workflowManager.getWorkflow(workflowName);
        if (workflow) {
          let steps = `Workflow: ${workflow.name}\nDescription: ${workflow.description}\n\nSteps:\n`;
          workflow.steps.forEach((step, i) => {
            steps += `${i + 1}. ${step.action.toUpperCase()}: ${step.description || step.url || step.element || 'Wait'}\n`;
          });
          addMessage(steps, 'assistant');
          // Log workflow steps to chat history
          chatHistory.push({
            role: 'assistant',
            content: steps,
            timestamp: new Date().toISOString(),
            context: 'workflow_steps'
          });
          await saveChatEvidence();
          return;
        } else {
          const notFoundMsg = `Workflow "${workflowName}" not found.`;
          addMessage(notFoundMsg, 'assistant');
          // Log workflow not found to chat history
          chatHistory.push({
            role: 'assistant',
            content: notFoundMsg,
            timestamp: new Date().toISOString(),
            context: 'workflow_error'
          });
          await saveChatEvidence();
          return;
        }
      }
    }

    if (message.toLowerCase().startsWith('run workflow ')) {
      const workflowName = message.substring(13).trim();
      if (workflowManager) {
        try {
          await workflowManager.executeWorkflow(
            workflowName,
            window.evidenceTools,
            async (msg) => {
              // Handle screenshot objects
              if (typeof msg === 'object' && msg.type === 'screenshot') {
                addMessage(`📸 ${msg.message}`, 'assistant', msg.screenshot);
                // Log workflow messages to chat history
                chatHistory.push({
                  role: 'assistant',
                  content: msg.message,
                  timestamp: new Date().toISOString(),
                  context: 'workflow_execution'
                });
              } else if (typeof msg === 'object' && msg.type === 'workflow-complete') {
                // Workflow completed - show generate report button
                showGenerateReportButton(msg.workflowName, msg.logData);
                // Don't log the workflow-complete object to chat history
              } else {
                addMessage(msg, 'assistant');
                // Log workflow messages to chat history
                chatHistory.push({
                  role: 'assistant',
                  content: msg,
                  timestamp: new Date().toISOString(),
                  context: 'workflow_execution'
                });
              }
              await saveChatEvidence();
            }
          );
          return;
        } catch (error) {
          const errorMsg = `Workflow error: ${error.message}`;
          addMessage(errorMsg, 'assistant');
          // Log workflow errors to chat history
          chatHistory.push({
            role: 'assistant',
            content: errorMsg,
            timestamp: new Date().toISOString(),
            context: 'workflow_error'
          });
          await saveChatEvidence();
          return;
        }
      }
    }

    if (message.toLowerCase() === 'list workflows') {
      if (workflowManager) {
        const workflows = workflowManager.getWorkflows();
        let list = 'Available workflows:\n\n';
        workflows.forEach((w, i) => {
          list += `${i + 1}. ${w.name}\n   ${w.description}\n\n`;
        });
        addMessage(list, 'assistant');
        // Log workflow list to chat history
        chatHistory.push({
          role: 'assistant',
          content: list,
          timestamp: new Date().toISOString(),
          context: 'workflow_list'
        });
        await saveChatEvidence();
        return;
      }
    }

    if (!novaProAgent) {
      addMessage('Nova Pro agent not available. Please refresh the extension.', 'assistant');
      return;
    }

    try {
      // Use Nova Pro for all chat interactions
      addMessage('Agent is thinking...', 'assistant');
      const result = await novaProAgent.handleManualChat(message);
      
      // Replace the "thinking" message with actual response
      const messages = chatArea.querySelectorAll('.message.assistant');
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        // Convert markdown to HTML for proper formatting
        let formattedMessage = result.message
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
          .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
          .replace(/(\d+)\.\s/g, '<br><strong>$1.</strong> ') // Numbered lists
          .replace(/^- (.*?)$/gm, '• $1<br>')                // Bullet points
          .replace(/\n\n/g, '<br><br>')                      // Double line breaks
          .replace(/\n/g, '<br>')                            // Single line breaks
          .replace(/^<br>/, '');                             // Remove leading break
        
        lastMessage.innerHTML = `<div>${formattedMessage}</div>`;
        
        // Add to chat history for evidence logging
        chatHistory.push({
          role: 'assistant',
          content: result.message,
          timestamp: new Date().toISOString()
        });
        
        // Save chat evidence after each response
        await saveChatEvidence();
      }
      
      // Handle screenshots if returned
      if (result.fullResult && result.fullResult.screenshot) {
        displayScreenshot(result.fullResult.screenshot);
      }
      
      // Check if intelligent error recovery is needed
      if (result.needsRecovery && result.needsRecovery.failedElement) {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          await handleClickErrorRecovery(result.needsRecovery.failedElement, tab.id);
        }
      }
    } catch (error) {
      console.error('Nova Pro chat error:', error);
      addMessage(`Error: ${error.message}`, 'assistant');
      
      // Log error to chat history too
      chatHistory.push({
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString()
      });
      await saveChatEvidence();
    }
  }

  // Run automation using workflow manager
  async function runAutomation() {
    if (!workflowManager) {
      addMessage('Workflow manager not available. Please refresh the extension.', 'assistant');
      return;
    }
    
    addMessage('Starting Automatic Evidence Collection...', 'assistant');
    
    try {
      // Run the first available workflow or default GitHub workflow
      const workflows = workflowManager.getWorkflows();
      const defaultWorkflow = workflows.find(w => w.name.includes('GitHub')) || workflows[0];
      
      if (!defaultWorkflow) {
        addMessage('No workflows available. Please check configuration.', 'assistant');
        return;
      }
      
      await workflowManager.executeWorkflow(
        defaultWorkflow.name, 
        window.evidenceTools,
        (message) => {
          // Handle screenshot objects
          if (typeof message === 'object' && message.type === 'screenshot') {
            addMessage(`📸 ${message.message}`, 'assistant', message.screenshot);
          } else if (typeof message === 'object' && message.type === 'workflow-complete') {
            // Workflow completed - show generate report button
            showGenerateReportButton(message.workflowName, message.logData);
          } else {
            addMessage(message, 'assistant');
          }
        }
      );
      
    } catch (error) {
      console.error('Workflow execution failed:', error);
      addMessage(`Workflow failed: ${error.message}`, 'assistant');
    }
  }
  
  // Add workflow button listener 
  const workflowBtn = document.getElementById('workflowButton');
  if (workflowBtn) {
    workflowBtn.addEventListener('click', showWorkflowInterface);
  }

  // Show workflow interface
  function showWorkflowInterface() {
    if (!workflowManager) {
      addMessage('Workflow manager not available. Please refresh the extension.', 'assistant');
      return;
    }

    const workflows = workflowManager.getWorkflows();
    
    // Create workflow interface HTML with same styling as assistant message
    let workflowHTML = '<div class="message assistant">';
    workflowHTML += '<div class="assistant-title">Available Workflows</div>';
    workflowHTML += '<div style="font-size: 12px; line-height: 1.3;">';
    
    workflows.forEach((workflow, index) => {
      workflowHTML += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; margin: 8px 0; background: rgba(255,255,255,0.5);">
          <div style="flex: 1;">
            <strong style="color: #1f2937; font-size: 12px;">${workflow.name}</strong>
            <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">${workflow.description}</div>
            <div style="font-size: 9px; color: #9ca3af; margin-top: 1px;">${workflow.steps.length} steps</div>
          </div>
          <div style="display: flex; gap: 6px; margin-left: 10px;">
            <button data-workflow="${workflow.name}" data-action="show"
                    title="Show Steps" 
                    style="background: #3b82f6; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px;">
              👁️
            </button>
            <button data-workflow="${workflow.name}" data-action="edit"
                    title="Edit Workflow" 
                    style="background: #f59e0b; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px;">
              ✏️
            </button>
            <button data-workflow="${workflow.name}" data-action="execute"
                    title="Execute Workflow" 
                    style="background: #10b981; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px;">
              ▶️
            </button>
          </div>
        </div>
      `;
    });
    
    workflowHTML += '</div></div>';
    
    // Add to chat area
    const chatArea = document.getElementById('chatArea');
    const workflowDiv = document.createElement('div');
    workflowDiv.innerHTML = workflowHTML;
    
    // Add event listeners to buttons
    workflowDiv.addEventListener('click', async (e) => {
      if (e.target.tagName === 'BUTTON') {
        const workflowName = e.target.getAttribute('data-workflow');
        const action = e.target.getAttribute('data-action');
        
        if (action === 'show') {
          showWorkflowSteps(workflowName);
        } else if (action === 'edit') {
          editWorkflow(workflowName);
        } else if (action === 'execute') {
          await executeWorkflow(workflowName);
        }
      }
    });
    
    chatArea.appendChild(workflowDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  // Edit workflow function
  function editWorkflow(workflowName) {
    const workflow = workflowManager.getWorkflow(workflowName);
    if (!workflow) {
      addMessage('Workflow not found.', 'assistant');
      return;
    }
    
    // Store workflow in session storage for designer to load
    browser.storage.local.set({ 
      editingWorkflow: workflow,
      editMode: true 
    }, () => {
      // Navigate current window to workflow designer
      window.location.href = 'workflow-designer.html';
    });
  }

  // Show workflow steps function
  async function showWorkflowSteps(workflowName) {
    // Reload workflows from S3 to get latest version
    await workflowManager.loadWorkflows();
    
    const workflow = workflowManager.getWorkflow(workflowName);
    if (workflow) {
      let steps = `📋 Workflow: ${workflow.name}\n📝 Description: ${workflow.description}\n\n🔢 Steps:\n`;
      workflow.steps.forEach((step, i) => {
        const stepIcon = step.action === 'navigate' ? '🌐' : 
                        step.action === 'screenshot' ? '📸' : 
                        step.action === 'click' ? '🖱️' : 
                        step.action === 'wait_for_user' ? '⏸️' : '⚙️';
        steps += `${i + 1}. ${stepIcon} ${step.action.toUpperCase()}: ${step.description || step.url || step.element || 'Wait'}\n`;
      });
      addMessage(steps, 'assistant');
    }
  };

  // Execute workflow function
  async function executeWorkflow(workflowName) {
    if (!workflowManager) {
      addMessage('Workflow manager not available.', 'assistant');
      return;
    }
    
    // Don't add message here - workflow-manager.js already sends it
    
    try {
      await workflowManager.executeWorkflow(
        workflowName, 
        window.evidenceTools,
        (message) => {
          // Handle screenshot objects
          if (typeof message === 'object' && message.type === 'screenshot') {
            addMessage(`📸 ${message.message}`, 'assistant', message.screenshot);
          } else if (typeof message === 'object' && message.type === 'workflow-complete') {
            // Workflow completed - show generate report button
            showGenerateReportButton(message.workflowName, message.logData);
          } else {
            addMessage(message, 'assistant');
          }
        },
        currentUsername || 'unknown'
      );
    } catch (error) {
      console.error('Workflow execution failed:', error);
      addMessage(`❌ Workflow failed: ${error.message}`, 'assistant');
    }
  };
  
  // Initialize workflow manager
  let workflowManager = null;
  
  // Initialize workflow manager
  async function initializeWorkflowManager() {
    try {
      if (!window.WorkflowManager) {
        console.error('WorkflowManager class not available');
        return;
      }
      
      workflowManager = new window.WorkflowManager();
      await workflowManager.loadWorkflows();
      console.log('Workflow manager initialized');
    } catch (error) {
      console.error('Failed to initialize workflow manager:', error);
    }
  }

  // Show workflow configuration
  function showWorkflowConfig() {
    if (!workflowManager) {
      addMessage('Workflow manager not available. Please refresh the extension.', 'assistant');
      return;
    }

    const workflows = workflowManager.getWorkflows();
    let configText = 'Available Workflows:\n\n';
    
    workflows.forEach((workflow, index) => {
      configText += `${index + 1}. ${workflow.name}\n`;
      configText += `   Description: ${workflow.description}\n`;
      configText += `   Steps: ${workflow.steps.length}\n\n`;
    });

    configText += 'To edit workflows, modify the workflow-config.json file or use commands like:\n';
    configText += '• "run workflow GitHub Audit"\n';
    configText += '• "list workflows"\n';
    configText += '• "show workflow steps GitHub Audit"';

    addMessage(configText, 'assistant');
  }

  // Add config button listener (if exists)
  const configBtn = document.getElementById('configButton');
  if (configBtn) {
    configBtn.addEventListener('click', showWorkflowConfig);
  }
  
  // Check for test workflow parameter from workflow designer
  function checkForTestWorkflow() {
    const urlParams = new URLSearchParams(window.location.search);
    const testWorkflowData = urlParams.get('testWorkflow');
    
    if (testWorkflowData) {
      try {
        const workflowData = JSON.parse(decodeURIComponent(testWorkflowData));
        console.log('Test workflow received:', workflowData);
        
        // Show workflow selection interface with the test workflow
        if (workflowData.workflows && workflowData.workflows.length > 0) {
          addMessage('🧪 Test workflow loaded from AI Workflow Designer!', 'assistant');
          
          // Create workflow selection interface
          let workflowHTML = '<div class="message assistant">';
          workflowHTML += '<div class="assistant-title">Test Workflow Ready</div>';
          workflowHTML += '<div style="font-size: 12px; line-height: 1.3;">';
          workflowHTML += 'Select a workflow to test:<br><br>';
          
          workflowData.workflows.forEach((workflow, index) => {
            workflowHTML += `<div class="workflow-item" style="margin: 8px 0; padding: 12px; background: rgba(59,130,246,0.1); border-radius: 8px; cursor: pointer; border: 1px solid rgba(59,130,246,0.3);" data-workflow-index="${index}" data-workflow-name="${workflow.name}">`;
            workflowHTML += `<strong>${workflow.name}</strong><br>`;
            workflowHTML += `<span style="opacity: 0.8;">${workflow.description}</span><br>`;
            workflowHTML += `<span style="opacity: 0.6; font-size: 11px;">${workflow.steps.length} steps</span>`;
            workflowHTML += '</div>';
          });
          
          workflowHTML += '</div></div>';
          
          // Add to chat
          const chatArea = document.getElementById('chatArea');
          if (chatArea) {
            chatArea.innerHTML += workflowHTML;
            chatArea.scrollTop = chatArea.scrollHeight;
            
            // Add event listeners to workflow items
            const workflowItems = chatArea.querySelectorAll('.workflow-item[data-workflow-index]');
            workflowItems.forEach(item => {
              item.addEventListener('click', () => {
                const workflowIndex = parseInt(item.getAttribute('data-workflow-index'));
                const workflowName = item.getAttribute('data-workflow-name');
                runTestWorkflow(workflowName, workflowIndex);
              });
            });
          }
          
          // Store test workflow data globally
          window.testWorkflowData = workflowData;
        }
        
        // Clear URL parameter
        window.history.replaceState({}, document.title, window.location.pathname);
        
      } catch (error) {
        console.error('Failed to parse test workflow data:', error);
        addMessage('❌ Failed to load test workflow. Invalid data format.', 'assistant');
      }
    }
  }

  // Helper function to wait for page load (same as workflow-manager.js)
  async function waitForPageLoad(maxWaitMs = 10000) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkPageLoad = async () => {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          
          if (tab.status === 'complete') {
            // Additional wait for dynamic content
            await new Promise(r => setTimeout(r, 1000));
            resolve();
            return;
          }
          
          if (Date.now() - startTime > maxWaitMs) {
            console.log('Page load timeout, proceeding anyway');
            resolve();
            return;
          }
          
          setTimeout(checkPageLoad, 500);
        } catch (error) {
          console.error('Error checking page load:', error);
          resolve();
        }
      };
      
      checkPageLoad();
    });
  }

  // Function to run test workflow (called from HTML onclick)
  window.runTestWorkflow = async function(workflowName, workflowIndex) {
    if (!window.testWorkflowData || !window.testWorkflowData.workflows[workflowIndex]) {
      addMessage('❌ Test workflow data not found.', 'assistant');
      return;
    }
    
    const workflow = window.testWorkflowData.workflows[workflowIndex];
    
    try {
      // Use WorkflowManager for consistent execution
      const workflowManager = new window.WorkflowManager();
      await workflowManager.loadWorkflows();
      
      // Temporarily add this workflow to the manager
      await workflowManager.addWorkflow(workflow);
      
      // Get username from session
      const session = await browser.storage.local.get(['username']);
      const username = session.username || 'test-user';
      
      // Execute using WorkflowManager (same as automated workflows)
      await workflowManager.executeWorkflow(
        workflow.name,
        window.evidenceTools,
        (message) => {
          if (typeof message === 'object' && message.type === 'screenshot') {
            addMessage(message.message, 'assistant', message.screenshot);
          } else if (typeof message === 'string') {
            addMessage(message, 'assistant');
          }
        },
        username
      );
      
    } catch (error) {
      console.error('Test workflow execution failed:', error);
      addMessage(`❌ Test workflow failed: ${error.message}`, 'assistant');
    }
  };

  // Function to continue workflow execution from a specific step
  window.continueWorkflowExecution = async function(workflow, fromStep) {
    try {
      for (let currentStep = fromStep; currentStep < workflow.steps.length; currentStep++) {
        const step = workflow.steps[currentStep];
        addMessage(`Step ${currentStep + 1}/${workflow.steps.length}: ${step.description}`, 'assistant');
        
        switch (step.action) {
          case 'navigate':
            if (step.url) {
              addMessage(`🌐 Navigate to: ${step.url}`, 'assistant');
              await browser.tabs.create({ url: step.url });
            }
            break;
            
          case 'wait_for_user':
            addMessage(`⏸️ ${step.description}`, 'assistant');
            
            // Create continue button
            let continueHTML = '<div class="message assistant">';
            continueHTML += '<div style="text-align: center; margin: 10px 0;">';
            continueHTML += '<button id="continueWorkflowBtn" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 500;">Continue Workflow</button>';
            continueHTML += '</div></div>';
            
            const chatArea = document.getElementById('chatArea');
            if (chatArea) {
              chatArea.innerHTML += continueHTML;
              chatArea.scrollTop = chatArea.scrollHeight;
              
              // Add event listener to continue button
              const continueBtn = document.getElementById('continueWorkflowBtn');
              if (continueBtn) {
                continueBtn.addEventListener('click', () => {
                  continueBtn.remove();
                  addMessage('✅ Continuing workflow...', 'user');
                  // Continue from next step
                  continueWorkflowExecution(workflow, currentStep + 1);
                });
              }
            }
            return; // Stop execution, wait for continue
            break;
            
          case 'screenshot':
            addMessage(`📸 ${step.description}`, 'assistant');
            try {
              const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
              const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
              
              if (s3Manager) {
                const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
                const result = await s3Manager.uploadScreenshot(dataUrl, tab.url, 'test-workflow');
                addMessage(`📸 ${result.message || 'Screenshot saved'}`, 'assistant', dataUrl);
              } else {
                addMessage(`📸 Screenshot captured (S3 not configured)`, 'assistant', dataUrl);
              }
            } catch (error) {
              addMessage(`❌ Screenshot failed: ${error.message}`, 'assistant');
            }
            break;
            
          case 'click':
            addMessage(`👆 Click on: ${step.element}`, 'assistant');
            // Actually execute the click
            try {
              const [clickTab] = await browser.tabs.query({ active: true, currentWindow: true });
              const clickResponse = await browser.tabs.sendMessage(clickTab.id, {
                action: 'clickElement',
                description: step.element
              });
              
              if (clickResponse && clickResponse.success) {
                addMessage(`✅ Clicked: ${clickResponse.message}`, 'assistant');
                // Wait for page to settle after click
                await new Promise(r => setTimeout(r, 2000)); // 2 second delay
                await waitForPageLoad(); // Then wait for page load
              } else {
                addMessage(`❌ Click failed: ${clickResponse?.error || 'Element not found'}`, 'assistant');
                // Show error recovery suggestions
                await handleClickErrorRecovery(step.element, clickTab.id);
              }
            } catch (clickError) {
              addMessage(`❌ Click error: ${clickError.message}`, 'assistant');
            }
            break;
            
          case 'wait':
            const duration = step.duration || 2000;
            addMessage(`⏳ Waiting ${duration}ms...`, 'assistant');
            await new Promise(resolve => setTimeout(resolve, duration));
            break;
            
          default:
            addMessage(`❓ Unknown action: ${step.action}`, 'assistant');
        }
        
        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      addMessage(`✅ Test workflow "${workflow.name}" completed!`, 'assistant');
      
    } catch (error) {
      console.error('Workflow continuation failed:', error);
      addMessage(`❌ Workflow failed: ${error.message}`, 'assistant');
    }
  };

  // Initialize workflow manager on load
  setTimeout(async () => {
    await initializeWorkflowManager();
    console.log('Workflow manager ready');
    
    // Check for test workflow parameter
    checkForTestWorkflow();
  }, 100);

  // Reload workflows when page becomes visible (returning from designer)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && workflowManager) {
      console.log('Page visible, reloading workflows from S3...');
      await workflowManager.loadWorkflows();
      console.log('Workflows reloaded');
    }
  });

  // Initialize Nova Pro agent on load
  setTimeout(() => {
    initializeNovaProAgent();
  }, 100);

  // Clear chat functionality (only if element exists)
  const clearChatButton = document.getElementById('clearChatButton');
  if (clearChatButton) {
    clearChatButton.addEventListener('click', () => {
      const chatArea = document.getElementById('chatArea');
      // Keep only the initial assistant message
      chatArea.innerHTML = `
        <div class="message assistant">
          <div class="assistant-title">Evidence Collection Assistant</div>
          <div style="font-size: 12px; line-height: 1.3;">
          I'm your AI assistant powered by Nova Pro! I can help you: Take screenshots and navigate websites, Answer questions about compliance evidence, Guide you through website interactions, Execute automated workflows, Provide general assistance. 
          
          <strong>Available Commands:</strong> "screenshot", "navigate github.com", "scroll down/up", "click settings", "find profile menu", or ask me anything.
          
          Try asking: "How do I capture evidence from GitHub?" or use direct commands like "screenshot" and "click settings"
        </div>
      </div>
    `;
    });
  }

  // Back button functionality
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      // Clear test mode when going back to home
      sessionStorage.removeItem('testMode');
      sessionStorage.removeItem('designerWorkflow');
      window.location.href = 'landing.html';
    });
  }

  // Logout functionality (only if element exists)
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      // Only clear credentials, keep configuration
      await browser.storage.local.remove(['credentials', 'username', 'userEmail', 'accessToken']);
      window.location.href = 'auth.html';
    });
  }

  // Test Mode functionality
  function initTestMode() {
    // Check both sessionStorage and URL params for test mode
    const sessionTestMode = sessionStorage.getItem('testMode');
    const urlParams = new URLSearchParams(window.location.search);
    const hasTestWorkflow = urlParams.has('testWorkflow');
    
    console.log('Test mode check:', {
      sessionTestMode,
      hasTestWorkflow,
      url: window.location.href
    });
    
    // If no testWorkflow in URL but we have session test mode, 
    // only clear it if we're not coming from workflow designer AND not going to workflow designer
    if (!hasTestWorkflow && sessionTestMode === 'true') {
      const referrer = document.referrer;
      const isFromDesigner = referrer.includes('workflow-designer.html');
      const goingToDesigner = sessionStorage.getItem('goingToDesigner') === 'true';
      
      // Clear the goingToDesigner flag
      sessionStorage.removeItem('goingToDesigner');
      
      // Don't clear if coming from designer or going to designer for editing
      if (!isFromDesigner && !goingToDesigner) {
        console.log('Clearing stale test mode (not designer related)');
        sessionStorage.removeItem('testMode');
        sessionStorage.removeItem('designerWorkflow');
      }
    }
    
    const isTestMode = (sessionTestMode === 'true' && hasTestWorkflow) || 
                      (sessionTestMode === 'true' && document.referrer.includes('workflow-designer.html'));
    console.log('Is test mode:', isTestMode);
    
    if (isTestMode) {
      // Hide workflow selector, automated workflow button, and refresh button in test mode
      const workflowSelector = document.getElementById('workflowSelector');
      const workflowButton = document.getElementById('workflowButton');
      const clearChatButton = document.getElementById('clearChatButton');
      
      if (workflowSelector) {
        workflowSelector.style.display = 'none';
      }
      if (workflowButton) {
        workflowButton.style.display = 'none';
      }
      if (clearChatButton) {
        clearChatButton.style.display = 'none';
      }
      
      const workflowData = sessionStorage.getItem('designerWorkflow');
      let workflowName = 'Generated Workflow';
      
      if (workflowData) {
        try {
          const workflow = JSON.parse(workflowData);
          workflowName = workflow.workflows?.[0]?.name || workflowName;
        } catch (error) {
          console.error('Failed to parse workflow data:', error);
        }
      }
      
      // Replace the initial assistant message with test mode UI
      const chatArea = document.getElementById('chatArea');
      if (chatArea) {
        chatArea.innerHTML = `
          <div class="message assistant">
            <div class="assistant-title">Workflow Test Mode</div>
            <div style="font-size: 12px; line-height: 1.3; margin-bottom: 12px;">
              Testing: <strong>${workflowName}</strong><br>
              Use the buttons below to edit or save the workflow after testing.
            </div>
            <div style="display: flex; gap: 8px;">
              <button data-action="edit" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; flex: 1;">
                ✏️ Edit Workflow
              </button>
              <button data-action="save" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; flex: 1;">
                💾 Save Workflow
              </button>
            </div>
          </div>
        `;
        
        // Use event delegation to handle button clicks
        chatArea.addEventListener('click', async (event) => {
          const button = event.target.closest('button[data-action]');
          if (!button) return;
          
          const action = button.getAttribute('data-action');
          
          if (action === 'edit') {
            console.log('Edit button clicked');
            // Set a flag to indicate we're going to designer for editing
            sessionStorage.setItem('goingToDesigner', 'true');
            window.location.href = 'workflow-designer.html';
          } else if (action === 'save') {
            console.log('Save button clicked');
            const workflowData = sessionStorage.getItem('designerWorkflow');
            if (workflowData) {
              try {
                const workflow = JSON.parse(workflowData);
                const workflowManager = new window.WorkflowManager();
                await workflowManager.loadWorkflows();
                
                // Add the workflow
                for (const wf of workflow.workflows) {
                  await workflowManager.addWorkflow(wf);
                }
                
                addMessage('✅ Workflow saved successfully!', 'assistant');
                button.textContent = '✅ Saved';
                button.disabled = true;
                setTimeout(() => {
                  button.textContent = '💾 Save Workflow';
                  button.disabled = false;
                }, 2000);
              } catch (error) {
                console.error('Save error:', error);
                addMessage('❌ Failed to save workflow: ' + error.message, 'assistant');
              }
            } else {
              console.log('No workflow data found in session');
            }
          }
        });
      }
    }
  }
  
  // Message handler for EmailReport tool
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'emailReport') {
      // Handle async operation properly
      (async () => {
        try {
          const { recipientEmail, workflowName, subject } = request;
          
          // Find the report to send
          let reportToSend = activeWorkflowReport;
          
          // If specific workflow name provided, try to find it
          if (workflowName && activeWorkflowReport?.workflowName !== workflowName) {
            return {
              success: false,
              error: `Workflow "${workflowName}" not found. Only the most recent workflow report is available.`
            };
          }
          
          // Check if we have an active report
          if (!reportToSend) {
            return {
              success: false,
              error: 'No workflow report available. Please run a workflow first.'
            };
          }
          
          // Send the email
          await sendReportEmail(
            reportToSend.reportHTML,
            reportToSend.workflowName,
            reportToSend.reportUrl,
            recipientEmail
          );
          
          return {
            success: true,
            message: `Report for "${reportToSend.workflowName}" emailed to ${recipientEmail}`
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      })().then(sendResponse).catch(err => {
        sendResponse({
          success: false,
          error: err.message
        });
      });
      return true; // Keep channel open for async response
    }
  });
  
  // Initialize test mode on page load
  console.log('Sidepanel.js loaded, initializing test mode...');
  initTestMode();

  function downloadScreenshot(dataUrl) {
    const link = document.createElement('a');
    link.download = `screenshot-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }
});
