// AWS Cognito Authentication using AWS SDK v3
import { 
  CognitoIdentityProviderClient, 
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  GetUserCommand 
} from '@aws-sdk/client-cognito-identity-provider';

import { 
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand
} from '@aws-sdk/client-cognito-identity';

import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';

class CognitoAuth {
  constructor() {
    this.cognitoConfig = null;
    this.credentials = null;
    this.cognitoIdpClient = null;
    this.cognitoIdentityClient = null;
  }

  async loadConfig() {
    const result = await chrome.storage.local.get(['cognitoConfig']);
    this.cognitoConfig = result.cognitoConfig;
    
    if (this.cognitoConfig) {
      // Initialize AWS SDK clients
      this.cognitoIdpClient = new CognitoIdentityProviderClient({ 
        region: this.cognitoConfig.region 
      });
      this.cognitoIdentityClient = new CognitoIdentityClient({ 
        region: this.cognitoConfig.region 
      });
    }
    
    return this.cognitoConfig;
  }

  async saveConfig(config) {
    await chrome.storage.local.set({ cognitoConfig: config });
    this.cognitoConfig = config;
    
    // Initialize AWS SDK clients
    this.cognitoIdpClient = new CognitoIdentityProviderClient({ 
      region: config.region 
    });
    this.cognitoIdentityClient = new CognitoIdentityClient({ 
      region: config.region 
    });
  }

  async authenticate(username, password) {
    if (!this.cognitoConfig) {
      throw new Error('Cognito not configured');
    }

    console.log('=== DEBUG AUTH START (AWS SDK v3) ===');
    console.log('Config:', this.cognitoConfig);
    console.log('Username:', username);

    try {
      const command = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.cognitoConfig.clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      });

      const response = await this.cognitoIdpClient.send(command);
      console.log('Auth response:', response);
      
      if (response.AuthenticationResult) {
        const accessToken = response.AuthenticationResult.AccessToken;
        const idToken = response.AuthenticationResult.IdToken;
        
        // Get AWS credentials using the ID token
        const credentials = await this.getAWSCredentials(idToken);
        
        await chrome.storage.session.set({ 
          accessToken: accessToken,
          idToken: idToken,
          credentials: credentials,
          username: username 
        });
        
        this.credentials = credentials;
        console.log('=== AUTH SUCCESS ===');
        return { success: true, credentials: credentials };
        
      } else if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        console.log('=== PASSWORD CHANGE REQUIRED ===');
        
        return { 
          success: false, 
          requiresPasswordChange: true, 
          session: response.Session,
          username: username 
        };
        
      } else {
        throw new Error(`Authentication failed: ${response.ChallengeName || 'Unknown error'}`);
      }
    } catch (error) {
      console.log('=== AUTH ERROR ===', error);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async getAWSCredentials(idToken) {
    if (!this.cognitoConfig.identityPoolId) {
      throw new Error('Identity Pool ID required for AWS credentials');
    }

    try {
      // Get Identity ID
      const getIdCommand = new GetIdCommand({
        IdentityPoolId: this.cognitoConfig.identityPoolId,
        Logins: {
          [`cognito-idp.${this.cognitoConfig.region}.amazonaws.com/${this.cognitoConfig.userPoolId}`]: idToken
        }
      });

      const idResponse = await this.cognitoIdentityClient.send(getIdCommand);
      const identityId = idResponse.IdentityId;

      // Get Credentials
      const getCredentialsCommand = new GetCredentialsForIdentityCommand({
        IdentityId: identityId,
        Logins: {
          [`cognito-idp.${this.cognitoConfig.region}.amazonaws.com/${this.cognitoConfig.userPoolId}`]: idToken
        }
      });

      const credResponse = await this.cognitoIdentityClient.send(getCredentialsCommand);
      return credResponse.Credentials;
      
    } catch (error) {
      console.error('Failed to get AWS credentials:', error);
      throw new Error(`Failed to get AWS credentials: ${error.message}`);
    }
  }

  async getUserEmail() {
    const session = await chrome.storage.session.get(['accessToken']);
    if (!session.accessToken) {
      throw new Error('Not authenticated');
    }

    if (!this.cognitoConfig) {
      await this.loadConfig();
    }

    try {
      const command = new GetUserCommand({
        AccessToken: session.accessToken
      });

      const response = await this.cognitoIdpClient.send(command);
      
      // Extract email from user attributes
      const emailAttr = response.UserAttributes?.find(attr => attr.Name === 'email');
      return emailAttr?.Value || null;
      
    } catch (error) {
      console.error('Failed to get user email:', error);
      return null;
    }
  }

  async respondToPasswordChallenge(username, newPassword, session) {
    if (!this.cognitoConfig) {
      throw new Error('Cognito not configured');
    }

    try {
      const command = new RespondToAuthChallengeCommand({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: this.cognitoConfig.clientId,
        Session: session,
        ChallengeResponses: {
          USERNAME: username,
          NEW_PASSWORD: newPassword
        }
      });
      
      const response = await this.cognitoIdpClient.send(command);
      
      if (response.AuthenticationResult) {
        const accessToken = response.AuthenticationResult.AccessToken;
        const idToken = response.AuthenticationResult.IdToken;
        
        // Get AWS credentials using the ID token
        const credentials = await this.getAWSCredentials(idToken);
        
        await chrome.storage.session.set({ 
          accessToken: accessToken,
          idToken: idToken,
          credentials: credentials,
          username: username 
        });
        
        this.credentials = credentials;
        return { success: true, credentials: credentials };
      } else {
        throw new Error('Password change failed');
      }
    } catch (error) {
      throw new Error(`Password change failed: ${error.message}`);
    }
  }

  async callBedrockAPI(message, includeTools = true, systemPrompt = null, conversationHistory = []) {
    const session = await chrome.storage.session.get(['credentials']);
    if (!session.credentials) {
      throw new Error('Not authenticated');
    }

    // Ensure config is loaded
    if (!this.cognitoConfig) {
      await this.loadConfig();
    }

    if (!this.cognitoConfig) {
      throw new Error('Cognito configuration not found');
    }

    const credentials = session.credentials;
    const region = this.cognitoConfig.region;
    
    try {
      // Create Bedrock Runtime client with credentials
      const bedrockClient = new BedrockRuntimeClient({
        region: region,
        credentials: {
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretKey,
          sessionToken: credentials.SessionToken
        }
      });

      // Build messages array with conversation history
      const messages = [];
      
      // Add conversation history if provided
      if (conversationHistory && conversationHistory.length > 0) {
        // Ensure first message is from user (Bedrock requirement)
        let validHistory = [...conversationHistory];
        
        // Remove any leading assistant messages
        while (validHistory.length > 0 && validHistory[0].role === 'assistant') {
          validHistory.shift();
        }
        
        // Add valid history
        for (const msg of validHistory) {
          // Skip if we have consecutive messages from same role
          if (messages.length > 0 && messages[messages.length - 1].role === msg.role) {
            continue;
          }
          
          messages.push({
            role: msg.role,
            content: [{ text: msg.content }]
          });
        }
      }
      
      // Add current message
      // Skip if last message was also from user (shouldn't happen but just in case)
      if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
        messages.push({
          role: "user",
          content: [{ text: message }]
        });
      }

      // Prepare request body
      const requestBody = {
        messages: messages,
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.7
        }
      };

      // Add system prompt if provided
      if (systemPrompt) {
        requestBody.system = [
          {
            text: systemPrompt
          }
        ];
      }

      // Add tool configuration if requested
      if (includeTools) {
        requestBody.toolConfig = {
          tools: [
            {
              toolSpec: {
                name: "NavigateToURL",
                description: "Navigate to a specific URL in the browser",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: {
                      url: {
                        type: "string",
                        description: "The URL to navigate to"
                      }
                    },
                    required: ["url"]
                  }
                }
              }
            },
            {
              toolSpec: {
                name: "TakeScreenshot",
                description: "Capture a screenshot of the current page",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: {
                      stepDescription: {
                        type: "string",
                        description: "Description of what this screenshot captures"
                      },
                      workflowName: {
                        type: "string",
                        description: "Name of the workflow this screenshot belongs to"
                      }
                    },
                    required: ["stepDescription"]
                  }
                }
              }
            },
            {
              toolSpec: {
                name: "ClickElement",
                description: "Click on an element on the page using natural language description",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: {
                      description: {
                        type: "string",
                        description: "Natural language description of element to click (e.g., 'first search result link', 'login button', 'submit form button', '2nd link')"
                      }
                    },
                    required: ["description"]
                  }
                }
              }
            },
            {
              toolSpec: {
                name: "WaitForElement",
                description: "Wait for an element to appear on the page",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: {
                      selector: {
                        type: "string",
                        description: "CSS selector for the element to wait for"
                      },
                      timeout: {
                        type: "number",
                        description: "Maximum time to wait in milliseconds (default: 5000)"
                      }
                    },
                    required: ["selector"]
                  }
                }
              }
            },
            {
              toolSpec: {
                name: "TypeText",
                description: "Type text into an input field or search box on the current page",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: {
                      text: {
                        type: "string",
                        description: "Text to type into the input field"
                      },
                      element: {
                        type: "string",
                        description: "Description of the input field (e.g., 'search box', 'email field', 'password field')"
                      }
                    },
                    required: ["text", "element"]
                  }
                }
              }
            },
            {
              toolSpec: {
                name: "SearchWebsite",
                description: "Search for elements on the current webpage using natural language",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: {
                      query: {
                        type: "string",
                        description: "Natural language description of what to find (e.g., 'login button', 'search box', 'submit form')"
                      }
                    },
                    required: ["query"]
                  }
                }
              }
            },
            {
              toolSpec: {
                name: "ScrollPage",
                description: "Scroll the page up or down",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: {
                      direction: {
                        type: "string",
                        description: "Direction to scroll: 'up' or 'down'"
                      },
                      amount: {
                        type: "string",
                        description: "Amount to scroll: 'small', 'medium', 'large', 'top', or 'bottom'"
                      }
                    },
                    required: ["direction"]
                  }
                }
              }
            }
          ]
        };
      }

      // Log what we're sending (for debugging)
      console.log('Bedrock API request:', {
        messageCount: messages.length,
        hasSystemPrompt: !!systemPrompt,
        hasTools: !!requestBody.toolConfig,
        toolCount: requestBody.toolConfig?.tools?.length || 0
      });

      // Invoke model
      const command = new InvokeModelCommand({
        modelId: 'amazon.nova-pro-v1:0',
        body: JSON.stringify(requestBody),
        contentType: 'application/json',
        accept: 'application/json'
      });

      const response = await bedrockClient.send(command);
      
      // Parse response
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody;
      
    } catch (error) {
      console.error('Bedrock API call failed:', error);
      throw new Error(`Bedrock API call failed: ${error.message}`);
    }
  }
}

// Export for ES6 modules (both named and default)
export { CognitoAuth };
export default CognitoAuth;

// Also make globally available for non-module contexts
if (typeof window !== 'undefined') {
  window.CognitoAuth = CognitoAuth;
}
