// Authentication UI Logic (Firefox version)
// Uses auth-sdk.js for AWS SDK v3 integration

// Import will be handled by webpack
// The CognitoAuth class is made globally available by auth-sdk.js

document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM loaded, checking for CognitoAuth...');
  console.log('window.CognitoAuth:', window.CognitoAuth);
  
  // Wait a bit for bundles to load if needed
  let attempts = 0;
  while (!window.CognitoAuth && attempts < 10) {
    console.log('Waiting for CognitoAuth... attempt', attempts + 1);
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (!window.CognitoAuth) {
    console.error('CognitoAuth not found after waiting!');
    document.getElementById('loginError').textContent = 'Failed to load authentication module. Please reload the page.';
    return;
  }
  
  console.log('CognitoAuth found, initializing...');
  
  // CognitoAuth is loaded from auth-sdk.js bundle
  const auth = new window.CognitoAuth();
  
  // Check if already configured
  const config = await auth.loadConfig();
  if (!config) {
    document.getElementById('setupForm').style.display = 'block';
    document.getElementById('loginForm').style.display = 'none';
  }
  // Setup form handlers
  const setupLink = document.getElementById('setupLink');
  if (setupLink) {
    setupLink.addEventListener('click', () => {
      document.getElementById('setupForm').style.display = 'block';
      document.getElementById('loginForm').style.display = 'none';
    });
  }

  // View Settings handler
  const viewSettingsLink = document.getElementById('viewSettingsLink');
  if (viewSettingsLink) {
    viewSettingsLink.addEventListener('click', async () => {
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
  }

  const backToLogin = document.getElementById('backToLogin');
  if (backToLogin) {
    backToLogin.addEventListener('click', () => {
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('setupForm').style.display = 'none';
    });
  }

  const saveConfigButton = document.getElementById('saveConfigButton');
  if (saveConfigButton) {
    saveConfigButton.addEventListener('click', async () => {
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
  }

  const loginButton = document.getElementById('loginButton');
  if (loginButton) {
    loginButton.addEventListener('click', async () => {
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
  }

  // Password change handler
  if (document.getElementById('changePasswordButton')) {
    document.getElementById('changePasswordButton').addEventListener('click', async () => {
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const errorDiv = document.getElementById('passwordChangeError');

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
          alert('Password changed successfully!');
          window.location.href = 'landing.html';
        }
      } catch (error) {
        errorDiv.textContent = error.message;
        document.getElementById('changePasswordButton').disabled = false;
      }
    });
  }

  // Enter key handlers
  if (document.getElementById('password')) {
    document.getElementById('password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('loginButton').click();
      }
    });
  }
});
