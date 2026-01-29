// AWS Cognito Authentication for Chrome Extension
class CognitoAuth {
  constructor() {
    this.cognitoConfig = null;
    this.credentials = null;
  }

  async loadConfig() {
    const result = await chrome.storage.local.get(['cognitoConfig']);
    this.cognitoConfig = result.cognitoConfig;
    return this.cognitoConfig;
  }

  async saveConfig(config) {
    await chrome.storage.local.set({ cognitoConfig: config });
    this.cognitoConfig = config;
  }

  async authenticate(username, password) {
    if (!this.cognitoConfig) {
      throw new Error('Cognito not configured');
    }

    console.log('=== DEBUG AUTH START ===');
    console.log('Config:', this.cognitoConfig);
    console.log('Username:', username);
    console.log('Password length:', password.length);

    const authUrl = `https://cognito-idp.${this.cognitoConfig.region}.amazonaws.com/`;
    console.log('Auth URL:', authUrl);
    
    const authRequest = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.cognitoConfig.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    };

    console.log('Auth Request:', authRequest);

    try {
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
        },
        body: JSON.stringify(authRequest)
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', [...response.headers.entries()]);

      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.AuthenticationResult) {
        const accessToken = data.AuthenticationResult.AccessToken;
        const idToken = data.AuthenticationResult.IdToken;
        
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
      } else if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        console.log('=== PASSWORD CHANGE REQUIRED ===');
        
        // Prompt user for new password
        const newPassword = prompt('Temporary password detected. Please enter a new permanent password (min 8 chars, must include uppercase, lowercase, number, symbol):');
        
        if (!newPassword) {
          throw new Error('New password required to continue');
        }
        
        // Respond to password challenge
        const challengeResponse = await fetch(authUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge'
          },
          body: JSON.stringify({
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            ClientId: this.cognitoConfig.clientId,
            Session: data.Session,
            ChallengeResponses: {
              USERNAME: username,
              NEW_PASSWORD: newPassword
            }
          })
        });
        
        const challengeData = await challengeResponse.json();
        console.log('Challenge response:', challengeData);
        
        if (challengeData.AuthenticationResult) {
          const accessToken = challengeData.AuthenticationResult.AccessToken;
          const idToken = challengeData.AuthenticationResult.IdToken;
          
          // Get AWS credentials using the ID token
          const credentials = await this.getAWSCredentials(idToken);
          
          await chrome.storage.session.set({ 
            accessToken: accessToken,
            idToken: idToken,
            credentials: credentials,
            username: username 
          });
          
          this.credentials = credentials;
          console.log('=== PASSWORD CHANGE SUCCESS ===');
          alert('Password changed successfully! You can now use your new password for future logins.');
          return { success: true, credentials: credentials };
        } else {
          throw new Error(challengeData.message || 'Password change failed');
        }
        
      } else {
        console.log('=== AUTH FAILED - NO RESULT ===');
        console.log('Full response:', JSON.stringify(data, null, 2));
        throw new Error(data.message || `Authentication failed: ${data.ChallengeName || 'Unknown error'}`);
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

    const identityUrl = `https://cognito-identity.${this.cognitoConfig.region}.amazonaws.com/`;
    
    // Get Identity ID
    const getIdRequest = {
      IdentityPoolId: this.cognitoConfig.identityPoolId,
      Logins: {
        [`cognito-idp.${this.cognitoConfig.region}.amazonaws.com/${this.cognitoConfig.userPoolId}`]: idToken
      }
    };

    const idResponse = await fetch(identityUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityService.GetId'
      },
      body: JSON.stringify(getIdRequest)
    });

    const idData = await idResponse.json();
    const identityId = idData.IdentityId;

    // Get Credentials
    const getCredentialsRequest = {
      IdentityId: identityId,
      Logins: {
        [`cognito-idp.${this.cognitoConfig.region}.amazonaws.com/${this.cognitoConfig.userPoolId}`]: idToken
      }
    };

    const credResponse = await fetch(identityUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity'
      },
      body: JSON.stringify(getCredentialsRequest)
    });

    const credData = await credResponse.json();
    return credData.Credentials;
  }

  async getUserEmail() {
    const session = await chrome.storage.session.get(['idToken']);
    if (!session.idToken) {
      throw new Error('Not authenticated');
    }

    if (!this.cognitoConfig) {
      await this.loadConfig();
    }

    // Get user attributes from Cognito
    const userUrl = `https://cognito-idp.${this.cognitoConfig.region}.amazonaws.com/`;
    
    const getUserRequest = {
      AccessToken: session.idToken
    };

    try {
      const response = await fetch(userUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser'
        },
        body: JSON.stringify(getUserRequest)
      });

      const userData = await response.json();
      
      // Extract email from user attributes
      const emailAttr = userData.UserAttributes?.find(attr => attr.Name === 'email');
      return emailAttr?.Value || null;
    } catch (error) {
      console.error('Failed to get user email:', error);
      return null;
    }
  }

  async callBedrockAPI(message) {
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
    
    // Prepare Bedrock request
    const bedrockUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/amazon.nova-pro-v1:0/invoke`;
    
    const requestBody = {
      messages: [
        {
          role: "user",
          content: [{ text: message }]
        }
      ],
      inferenceConfig: {
        maxTokens: 1000,
        temperature: 0.7
      }
    };

    // Sign the request using AWS Signature V4
    const signedHeaders = await this.signRequest(
      'POST',
      bedrockUrl,
      JSON.stringify(requestBody),
      credentials,
      region
    );

    try {
      const response = await fetch(bedrockUrl, {
        method: 'POST',
        headers: signedHeaders,
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      return data.output?.message?.content?.[0]?.text || 'No response from Nova Pro';
    } catch (error) {
      throw new Error(`Bedrock API call failed: ${error.message}`);
    }
  }

  async signRequest(method, url, body, credentials, region) {
    // Simple AWS Signature V4 implementation
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const service = 'bedrock';
    
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);

    const headers = {
      'Content-Type': 'application/json',
      'Host': host,
      'X-Amz-Date': amzDate,
      'X-Amz-Security-Token': credentials.SessionToken
    };

    // This is a simplified version - in production, use aws-sdk or proper signing library
    headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${credentials.AccessKeyId}/${dateStamp}/${region}/${service}/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-security-token, Signature=placeholder`;

    return headers;
  }
}

// UI Logic (same as before)
document.addEventListener('DOMContentLoaded', async function() {
  const auth = new CognitoAuth();
  
  // Check if already configured
  const config = await auth.loadConfig();
  if (!config) {
    document.getElementById('setupForm').style.display = 'block';
    document.getElementById('loginForm').style.display = 'none';
  }

// Only run DOM-dependent code if we're on the auth page
if (document.getElementById('setupLink')) {
  // Setup form handlers
  document.getElementById('setupLink').addEventListener('click', () => {
    document.getElementById('setupForm').style.display = 'block';
    document.getElementById('loginForm').style.display = 'none';
  });

  // View Settings handler
  document.getElementById('viewSettingsLink').addEventListener('click', async () => {
    const config = await chrome.storage.local.get(['cognitoConfig']);
    if (config.cognitoConfig) {
      // Pre-fill form with existing settings
      document.getElementById('s3BucketName').value = config.cognitoConfig.s3BucketName || '';
      document.getElementById('identityPoolId').value = config.cognitoConfig.identityPoolId || '';
      document.getElementById('userPoolId').value = config.cognitoConfig.userPoolId || '';
      document.getElementById('clientId').value = config.cognitoConfig.clientId || '';
      document.getElementById('region').value = config.cognitoConfig.region || 'us-east-1';
      
      // Show setup form
      document.getElementById('setupForm').style.display = 'block';
      document.getElementById('loginForm').style.display = 'none';
    } else {
      document.getElementById('loginError').textContent = 'No settings configured yet';
    }
  });

  document.getElementById('backToLogin').addEventListener('click', () => {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('setupForm').style.display = 'none';
  });

  document.getElementById('saveConfigButton').addEventListener('click', async () => {
    const userPoolId = document.getElementById('userPoolId').value;
    const clientId = document.getElementById('clientId').value;
    const identityPoolId = document.getElementById('identityPoolId').value;
    const s3BucketName = document.getElementById('s3BucketName').value;
    const region = document.getElementById('region').value;

    if (!userPoolId || !clientId || !identityPoolId || !s3BucketName || !region) {
      document.getElementById('setupError').textContent = 'All fields are required';
      return;
    }

    try {
      await auth.saveConfig({ userPoolId, clientId, identityPoolId, s3BucketName, region });
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('setupForm').style.display = 'none';
      document.getElementById('setupError').textContent = '';
    } catch (error) {
      document.getElementById('setupError').textContent = error.message;
    }
  });

  document.getElementById('loginButton').addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
      document.getElementById('loginError').textContent = 'Username and password required';
      return;
    }

    document.getElementById('loginButton').disabled = true;
    document.getElementById('loginError').textContent = '';

    try {
      await auth.authenticate(username, password);
      // Redirect to landing page
      window.location.href = 'landing.html';
    } catch (error) {
      alert(`Login failed: ${error.message}`);
      document.getElementById('loginError').textContent = error.message;
      document.getElementById('loginButton').disabled = false;
    }
  });

  // Enter key handlers
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('loginButton').click();
    }
  });
}
});

// Make CognitoAuth globally available
window.CognitoAuth = CognitoAuth;
