// Nova Pro SOX Agent for Firefox Extension
class NovaProSOXAgent {
  constructor() {
    this.isInitialized = false;
  }

  async initializeAgent() {
    // Get existing Cognito credentials from browser storage
    const session = await browser.storage.local.get(['credentials']);
    const config = await browser.storage.local.get(['cognitoConfig']);
    
    if (!session.credentials || !config.cognitoConfig) {
      throw new Error('No AWS credentials available. Please login first.');
    }

    this.credentials = session.credentials;
    this.region = config.cognitoConfig.region;
    this.isInitialized = true;

    console.log('Nova Pro agent initialized');
  }

  // Simple text-only chat without tools (for analysis tasks)
  async simpleChat(message) {
    if (!this.isInitialized) {
      await this.initializeAgent();
    }

    try {
      if (!window.CognitoAuth) {
        throw new Error('CognitoAuth not available');
      }
      
      const auth = new window.CognitoAuth();
      const response = await auth.callBedrockAPI(message);
      
      // Extract text from response - handle both string and object returns
      if (typeof response === 'string') {
        return response;
      } else if (response.output?.message?.content?.[0]?.text) {
        return response.output.message.content[0].text;
      }
      
      return 'No response from Nova Pro';
    } catch (error) {
      console.error('Simple chat error:', error);
      throw error;
    }
  }

  // Manual chat using Nova Pro - handles both text and tool responses
  async handleManualChat(message) {
    if (!this.isInitialized) {
      await this.initializeAgent();
    }

    console.log('Nova Pro handling chat:', message);
    
    try {
      if (!window.CognitoAuth) {
        throw new Error('CognitoAuth not available');
      }
      
      const auth = new window.CognitoAuth();
      const response = await auth.callBedrockAPI(message);
      
      console.log('Nova Pro response:', response);
      
      // Handle tool responses - check for correct structure
      if (response.output?.message?.content) {
        let toolResults = [];
        let textContent = '';
        
        for (const item of response.output.message.content) {
          if (item.toolUse) {
            console.log('Tool called:', item.toolUse.name, 'with input:', item.toolUse.input);
            
            try {
              const toolResult = await window.evidenceTools.executeTool(item.toolUse.name, item.toolUse.input);
              const parsedResult = JSON.parse(toolResult);
              
              if (parsedResult.success) {
                let actionMessage = '';
                if (item.toolUse.name === 'NavigateToURL') {
                  actionMessage = `Navigating to ${item.toolUse.input.url}`;
                } else if (item.toolUse.name === 'TakeScreenshot') {
                  actionMessage = parsedResult.message;
                } else if (item.toolUse.name === 'ClickElement') {
                  actionMessage = `Clicking on ${item.toolUse.input.description}`;
                } else {
                  actionMessage = parsedResult.message;
                }
                
                toolResults.push({
                  success: true,
                  message: actionMessage,
                  screenshot: parsedResult.screenshot
                });
              } else {
                // Tool failed - check if it's a click error that needs recovery
                if (item.toolUse.name === 'ClickElement') {
                  toolResults.push({
                    success: false,
                    message: `Tool error: ${parsedResult.error}`,
                    needsRecovery: true,
                    failedElement: item.toolUse.input.description
                  });
                } else {
                  toolResults.push({
                    success: false,
                    message: `Tool error: ${parsedResult.error}`
                  });
                }
              }
            } catch (toolError) {
              toolResults.push({
                success: false,
                message: `Tool execution failed: ${toolError.message}`
              });
            }
          } else if (item.text) {
            textContent += item.text;
          }
        }
        
        if (toolResults.length > 0) {
          const successfulResults = toolResults.filter(r => r.success);
          const failedResults = toolResults.filter(r => !r.success);
          const screenshot = successfulResults.find(r => r.screenshot)?.screenshot;
          const needsRecovery = failedResults.find(r => r.needsRecovery);
          
          return {
            success: successfulResults.length > 0,
            message: toolResults.map(r => r.message).join('\n'),
            fullResult: { screenshot },
            needsRecovery: needsRecovery ? {
              failedElement: needsRecovery.failedElement
            } : null
          };
        } else if (textContent) {
          // Filter out reasoning patterns from text responses
          let cleanContent = textContent;
          if (cleanContent && typeof cleanContent === 'string') {
            cleanContent = cleanContent.replace(/The user is asking.*?(?=\n|$)/g, '');
            cleanContent = cleanContent.replace(/The user has requested.*?(?=\n|$)/g, '');
            cleanContent = cleanContent.replace(/I should.*?(?=\n|$)/g, '');
            cleanContent = cleanContent.replace(/I need to.*?(?=\n|$)/g, '');
            cleanContent = cleanContent.replace(/I will.*?(?=\n|$)/g, '');
            cleanContent = cleanContent.replace(/I'll.*?(?=\n|$)/g, '');
            cleanContent = cleanContent.replace(/Let me.*?(?=\n|$)/g, '');
            cleanContent = cleanContent.replace(/.*?I will use the \w+ tool.*?(?=\n|$)/g, '');
            cleanContent = cleanContent.replace(/\s+/g, ' ').trim();
            cleanContent = cleanContent.replace(/^\s*[\r\n]/gm, '');
            
            if (!cleanContent || cleanContent.length < 3) {
              cleanContent = textContent; // Keep original if filtering removes everything
            }
          }
          
          return {
            success: true,
            message: cleanContent,
            fullResult: { text: cleanContent }
          };
        }
      }
      
      // Fallback for simple text response
      const simpleText = response.output?.message?.content?.[0]?.text || 
                        response.content || 
                        response.message || 
                        response.text ||
                        'No response from agent';
      
      return {
        success: true,
        message: simpleText,
        fullResult: { text: simpleText }
      };
    } catch (error) {
      console.error('Nova Pro chat failed:', error);
      throw error;
    }
  }
}

// Export for use in sidebar
window.NovaProSOXAgent = NovaProSOXAgent;
