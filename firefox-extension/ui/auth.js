// AWS Cognito Authentication for Chrome Extension
class CognitoAuth {
  constructor() {
    this.cognitoConfig = null;
    this.credentials = null;
  }

  async loadConfig() {
    const result = await browser.storage.local.get(['cognitoConfig']);
    this.cognitoConfig = result.cognitoConfig;
    return this.cognitoConfig;
  }

  async saveConfig(config) {
    await browser.storage.local.set({ cognitoConfig: config });
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
        
        await browser.storage.local.set({ 
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
        
        // Show password change form instead of prompt
        return { 
          success: false, 
          requiresPasswordChange: true, 
          session: data.Session,
          username: username 
        };
        
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
    const session = await browser.storage.local.get(['idToken']);
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

  async respondToPasswordChallenge(username, newPassword, session) {
    if (!this.cognitoConfig) {
      throw new Error('Cognito not configured');
    }

    const authUrl = `https://cognito-idp.${this.cognitoConfig.region}.amazonaws.com/`;
    
    const challengeResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge'
      },
      body: JSON.stringify({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: this.cognitoConfig.clientId,
        Session: session,
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
      
      await browser.storage.local.set({ 
        accessToken: accessToken,
        idToken: idToken,
        credentials: credentials,
        username: username 
      });
      
      this.credentials = credentials;
      console.log('=== PASSWORD CHANGE SUCCESS ===');
      return { success: true, credentials: credentials };
    } else {
      throw new Error(challengeData.message || 'Password change failed');
    }
  }

  async callBedrockAPI(message) {
    const session = await browser.storage.local.get(['credentials']);
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
    const config = await browser.storage.local.get(['cognitoConfig']);
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
      const result = await auth.authenticate(username, password);
      
      if (result.success) {
        // Redirect to landing page
        window.location.href = 'landing.html';
      } else if (result.requiresPasswordChange) {
        // Show password change form
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('passwordChangeForm').style.display = 'block';
        
        // Store session data for password change
        window.passwordChangeData = {
          username: result.username,
          session: result.session
        };
      }
    } catch (error) {
      document.getElementById('loginError').textContent = error.message;
      document.getElementById('loginButton').disabled = false;
    }
  });

  // Password change handler
  document.getElementById('changePasswordButton').addEventListener('click', async () => {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('passwordChangeError');

    // Validation
    if (!newPassword || !confirmPassword) {
      errorDiv.textContent = 'Both fields are required';
      return;
    }

    if (newPassword !== confirmPassword) {
      errorDiv.textContent = 'Passwords do not match';
      return;
    }

    if (newPassword.length < 8) {
      errorDiv.textContent = 'Password must be at least 8 characters';
      return;
    }

    // Check password complexity
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSymbol = /[^A-Za-z0-9]/.test(newPassword);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSymbol) {
      errorDiv.textContent = 'Password must include uppercase, lowercase, number, and symbol';
      return;
    }

    document.getElementById('changePasswordButton').disabled = true;
    errorDiv.textContent = '';

    try {
      const result = await auth.respondToPasswordChallenge(
        window.passwordChangeData.username,
        newPassword,
        window.passwordChangeData.session
      );

      if (result.success) {
        alert('Password changed successfully! Redirecting to landing page...');
        window.location.href = 'landing.html';
      }
    } catch (error) {
      errorDiv.textContent = error.message;
      document.getElementById('changePasswordButton').disabled = false;
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
