// Import S3 helper
import { uploadToS3, downloadFromS3, listS3Objects } from './s3-helper.js';

// Workflow Configuration Manager
class WorkflowManager {
  constructor() {
    this.workflows = [];
    this.loadWorkflows();
    this.currentWorkflowLog = null;
  }

  async loadWorkflows() {
    try {
      // Try loading from S3 first
      const s3Manager = new window.S3Manager();
      const s3Workflows = await s3Manager.loadWorkflowsFromS3();
      
      if (s3Workflows && s3Workflows.length > 0) {
        // Use workflows from S3
        this.workflows = s3Workflows;
        console.log('Workflows loaded from S3:', this.workflows.map(w => w.name));
      } else {
        // First time use - load seed workflows from config file
        console.log('No workflows in S3, loading seed workflows from config file');
        const response = await fetch(browser.runtime.getURL('config/workflow-config.json'));
        const config = await response.json();
        this.workflows = config.workflows;
        
        // Save seed workflows to S3 for future use
        await this.saveWorkflows();
        console.log('Seed workflows saved to S3:', this.workflows.map(w => w.name));
      }
    } catch (error) {
      console.error('Failed to load workflows from S3, falling back to config file:', error);
      
      // Fallback to config file (read-only mode)
      try {
        const response = await fetch(browser.runtime.getURL('config/workflow-config.json'));
        const config = await response.json();
        this.workflows = config.workflows;
        console.log('Workflows loaded from config file (fallback):', this.workflows.map(w => w.name));
      } catch (configError) {
        console.error('Failed to load workflows from config file:', configError);
        this.workflows = [];
      }
    }
  }

  async saveWorkflows() {
    try {
      const s3Manager = new window.S3Manager();
      await s3Manager.saveWorkflowsToS3(this.workflows);
      console.log('Workflows saved to S3');
    } catch (error) {
      console.error('Failed to save workflows to S3:', error);
      throw error;
    }
  }

  getWorkflows() {
    return this.workflows;
  }

  getWorkflow(name) {
    return this.workflows.find(w => w.name === name);
  }

  async waitForPageLoad(maxWaitMs = 10000) {
    // Wait for page to be fully loaded
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkPageLoad = async () => {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          
          // Check if tab is still loading
          if (tab.status === 'complete') {
            // Additional wait for dynamic content
            await new Promise(r => setTimeout(r, 1000));
            resolve();
            return;
          }
          
          // Timeout check
          if (Date.now() - startTime > maxWaitMs) {
            console.log('Page load timeout, proceeding anyway');
            resolve();
            return;
          }
          
          // Check again in 500ms
          setTimeout(checkPageLoad, 500);
        } catch (error) {
          console.error('Error checking page load:', error);
          resolve(); // Proceed anyway on error
        }
      };
      
      checkPageLoad();
    });
  }

  async addWorkflow(workflow) {
    // Check if workflow with same name already exists
    const existingIndex = this.workflows.findIndex(w => w.name === workflow.name);
    if (existingIndex !== -1) {
      console.log(`Workflow "${workflow.name}" already exists, updating instead of adding`);
      this.workflows[existingIndex] = workflow;
    } else {
      this.workflows.push(workflow);
    }
    await this.saveWorkflows();
  }

  async updateWorkflow(name, updatedWorkflow) {
    const index = this.workflows.findIndex(w => w.name === name);
    if (index !== -1) {
      this.workflows[index] = updatedWorkflow;
      await this.saveWorkflows();
    }
  }

  async deleteWorkflow(name) {
    this.workflows = this.workflows.filter(w => w.name !== name);
    await this.saveWorkflows();
  }

  // Execute a workflow
  async executeWorkflow(workflowName, toolsManager, messageCallback, username = 'unknown') {
    const workflow = this.getWorkflow(workflowName);
    if (!workflow) {
      throw new Error(`Workflow '${workflowName}' not found`);
    }

    // Initialize workflow log
    this.currentWorkflowLog = {
      workflowName: workflow.name,
      username: username,
      startTime: new Date().toISOString(),
      steps: [],
      status: 'running',
      s3Bucket: null,
      region: null
    };
    
    // Get S3 config for report
    try {
      const config = await browser.storage.local.get(['cognitoConfig']);
      if (config.cognitoConfig) {
        this.currentWorkflowLog.s3Bucket = config.cognitoConfig.s3BucketName;
        this.currentWorkflowLog.region = config.cognitoConfig.region;
      }
    } catch (error) {
      console.error('Failed to get S3 config:', error);
    }

    messageCallback(`🚀 Starting workflow: ${workflow.name}`);

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepLog = {
        stepNumber: i + 1,
        action: step.action,
        description: step.description,
        startTime: new Date().toISOString(),
        status: 'running'
      };
      
      messageCallback(`▶️ Step ${i + 1}: ${step.description}`);

      try {
        switch (step.action) {
          case 'navigate':
            stepLog.url = step.url;
            await toolsManager.executeTool('NavigateToURL', { url: step.url });
            // Wait for page to fully load after navigation
            await this.waitForPageLoad();
            // Additional wait for dynamic content (especially for sites like GitHub)
            await new Promise(resolve => setTimeout(resolve, 2000));
            break;
          case 'screenshot':
            // Ensure page is fully loaded before screenshot
            await this.waitForPageLoad();
            
            // Additional validation - check if tab is accessible
            try {
              const [checkTab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!checkTab || !checkTab.url || checkTab.url === '') {
                throw new Error('Tab not accessible or URL is empty. Please ensure the page is fully loaded.');
              }
            } catch (tabError) {
              throw new Error(`Cannot access tab: ${tabError.message}`);
            }
            
            // Pass workflow context to screenshot tool
            const screenshotResult = await toolsManager.executeTool('TakeScreenshot', {
              workflowName: workflow.name,
              stepDescription: step.description || `step-${i + 1}`
            });
            // Parse the result to extract screenshot data
            try {
              const parsed = JSON.parse(screenshotResult);
              if (parsed.success && parsed.screenshot) {
                // Store screenshot info in step log
                if (parsed.s3Upload) {
                  stepLog.screenshotUrl = parsed.s3Upload.s3Url || parsed.s3Upload.filename;
                  stepLog.screenshotFilename = parsed.s3Upload.filename;
                }
                stepLog.screenshotData = parsed.screenshot;
                
                // Use a special callback that can handle screenshot data
                messageCallback({
                  type: 'screenshot',
                  message: parsed.message || 'Screenshot captured',
                  screenshot: parsed.screenshot
                });
              } else {
                messageCallback(`📸 ${parsed.message || 'Screenshot captured'}`);
              }
            } catch (e) {
              messageCallback('📸 Screenshot captured');
            }
            break;
          case 'click':
            await toolsManager.executeTool('ClickElement', { description: step.element });
            // Wait for page to settle after click (might trigger navigation)
            await this.waitForPageLoad();
            break;
          case 'wait':
            await new Promise(resolve => setTimeout(resolve, step.duration || 2000));
            break;
          case 'wait_for_user':
            messageCallback(`⏸️ ${step.description || 'Please complete the manual step, then click Continue'}`);
            console.log('Creating continue button...');
            await this.waitForUserConfirmation();
            messageCallback('✅ Continuing workflow...');
            break;
        }

        // Mark step as successful
        stepLog.status = 'success';
        stepLog.endTime = new Date().toISOString();
        this.currentWorkflowLog.steps.push(stepLog);

        // Wait between steps
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        // Mark step as failed
        stepLog.status = 'failed';
        stepLog.error = error.message;
        stepLog.endTime = new Date().toISOString();
        this.currentWorkflowLog.steps.push(stepLog);
        
        messageCallback(`❌ Error in step ${i + 1}: ${error.message}`);
        
        // Intelligent Error Recovery - Ask Nova for help
        if (step.action === 'click' || step.action === 'navigate') {
          messageCallback(`🤖 Analyzing page for alternative options...`);
          
          try {
            const recovery = await this.intelligentErrorRecovery(step, error, toolsManager, messageCallback);
            
            if (recovery.shouldContinue) {
              messageCallback(`✅ Recovery successful! Continuing workflow...`);
              // Update step log to show recovery
              stepLog.status = 'recovered';
              stepLog.recoveryAction = recovery.action;
              continue; // Continue to next step
            }
          } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
          }
        }
        
        // Mark workflow as failed and save log
        this.currentWorkflowLog.status = 'failed';
        this.currentWorkflowLog.endTime = new Date().toISOString();
        await this.saveWorkflowLog();
        
        throw error;
      }
    }

    // Mark workflow as completed and save log
    this.currentWorkflowLog.status = 'completed';
    this.currentWorkflowLog.endTime = new Date().toISOString();
    await this.saveWorkflowLog();

    messageCallback(`✅ Workflow '${workflow.name}' completed successfully!`);
    
    // Show generate report button
    messageCallback({
      type: 'workflow-complete',
      workflowName: workflow.name,
      logData: this.currentWorkflowLog
    });
  }

  async saveWorkflowLog() {
    if (!this.currentWorkflowLog) return;
    
    try {
      const s3Manager = new window.S3Manager();
      await s3Manager.saveWorkflowLog(this.currentWorkflowLog);
      console.log('✅ Workflow log saved to S3');
    } catch (error) {
      console.error('❌ Failed to save workflow log:', error);
    }
  }

  // Intelligent Error Recovery using Nova
  async intelligentErrorRecovery(failedStep, error, toolsManager, messageCallback) {
    try {
      // Get all clickable elements on current page
      const elements = await toolsManager.executeTool('ShowCheckboxes', {});
      
      // Ask Nova for suggestions
      const prompt = `A workflow step failed with this error: "${error.message}"

Failed Step:
- Action: ${failedStep.action}
- Target: ${failedStep.element || failedStep.url}
- Description: ${failedStep.description}

Available elements on the current page:
${elements}

Please analyze the situation and suggest:
1. What likely went wrong
2. Which alternative element(s) the user should try instead
3. Whether we should skip this step or try a different approach

Respond in JSON format:
{
  "analysis": "brief explanation of what went wrong",
  "suggestions": [
    {"element": "element name", "reason": "why this might work"},
    {"element": "another option", "reason": "alternative approach"}
  ],
  "recommendation": "skip" or "retry" or "alternative"
}`;

      // Call Nova
      const novaAgent = new window.NovaAgent();
      const response = await novaAgent.chat(prompt);
      
      // Parse Nova response
      let aiSuggestion;
      try {
        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiSuggestion = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        return { shouldContinue: false };
      }

      // Present options to user
      messageCallback(`\n🤖 **Nova 2 Lite Analysis:**\n${aiSuggestion.analysis}\n`);
      
      if (aiSuggestion.suggestions && aiSuggestion.suggestions.length > 0) {
        messageCallback(`\n**Suggested alternatives:**`);
        aiSuggestion.suggestions.forEach((sug, idx) => {
          messageCallback(`${idx + 1}. **${sug.element}** - ${sug.reason}`);
        });
        
        messageCallback(`\n💡 Recommendation: ${aiSuggestion.recommendation}`);
        messageCallback(`\nWould you like to:\n1. Try suggested alternative\n2. Skip this step\n3. Stop workflow`);
        
        // Wait for user decision
        const decision = await this.waitForRecoveryDecision(aiSuggestion);
        
        if (decision.action === 'retry' && decision.element) {
          // Try the suggested element
          await toolsManager.executeTool('ClickElement', { description: decision.element });
          await this.waitForPageLoad();
          return { shouldContinue: true, action: `Clicked ${decision.element}` };
        } else if (decision.action === 'skip') {
          return { shouldContinue: true, action: 'Skipped step' };
        }
      }
      
      return { shouldContinue: false };
    } catch (recoveryError) {
      console.error('Error recovery failed:', recoveryError);
      return { shouldContinue: false };
    }
  }

  // Wait for user's recovery decision
  async waitForRecoveryDecision(aiSuggestion) {
    return new Promise((resolve) => {
      // Create recovery decision UI
      const recoveryDiv = document.createElement('div');
      recoveryDiv.className = 'message assistant';
      recoveryDiv.innerHTML = `
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          ${aiSuggestion.suggestions.map((sug, idx) => 
            `<button class="recovery-btn" data-action="retry" data-element="${sug.element}" 
              style="flex: 1; padding: 8px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
              Try: ${sug.element}
            </button>`
          ).join('')}
          <button class="recovery-btn" data-action="skip" 
            style="flex: 1; padding: 8px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer;">
            Skip Step
          </button>
          <button class="recovery-btn" data-action="stop" 
            style="flex: 1; padding: 8px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">
            Stop Workflow
          </button>
        </div>
      `;
      
      const chatArea = document.getElementById('chatArea');
      chatArea.appendChild(recoveryDiv);
      chatArea.scrollTop = chatArea.scrollHeight;
      
      // Add click handlers
      recoveryDiv.querySelectorAll('.recovery-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-action');
          const element = btn.getAttribute('data-element');
          recoveryDiv.remove();
          resolve({ action, element });
        });
      });
    });
  }

  // Wait for user confirmation
  async waitForUserConfirmation(buttonText = 'Continue Workflow') {
    console.log('waitForUserConfirmation called');
    return new Promise((resolve) => {
      // Create continue button
      const continueBtn = document.createElement('button');
      continueBtn.textContent = buttonText;
      continueBtn.style.cssText = `
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        margin: 10px 0;
        display: block;
      `;
      
      continueBtn.onclick = () => {
        console.log('Continue button clicked');
        continueBtn.remove();
        resolve();
      };
      
      // Add to chat area
      const chatArea = document.getElementById('chatArea');
      if (chatArea) {
        chatArea.appendChild(continueBtn);
        chatArea.scrollTop = chatArea.scrollHeight;
        console.log('Continue button added to chat area');
      } else {
        console.error('Chat area not found');
      }
    });
  }
}

// Make globally available
window.WorkflowManager = WorkflowManager;
