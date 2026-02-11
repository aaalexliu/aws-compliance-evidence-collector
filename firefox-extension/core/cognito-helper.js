// Cognito Helper Utilities (Firefox version)
// Reusable functions for Cognito operations using AWS SDK v3

import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

// Cache for user email to avoid repeated API calls
let cachedUserEmail = null;

/**
 * Get user email from Cognito (with caching)
 */
export async function getCachedUserEmail() {
  if (cachedUserEmail) {
    return cachedUserEmail;
  }

  try {
    const session = await browser.storage.local.get(['accessToken', 'cognitoConfig']);
    
    if (!session.accessToken || !session.cognitoConfig) {
      return null;
    }

    const client = new CognitoIdentityProviderClient({ 
      region: session.cognitoConfig.region 
    });

    const command = new GetUserCommand({
      AccessToken: session.accessToken
    });

    const response = await client.send(command);
    
    // Extract email from user attributes
    const emailAttr = response.UserAttributes?.find(attr => attr.Name === 'email');
    cachedUserEmail = emailAttr?.Value || null;
    
    return cachedUserEmail;
  } catch (error) {
    console.error('Failed to get user email:', error);
    return null;
  }
}

/**
 * Clear cached user email (call on logout)
 */
export function clearUserEmailCache() {
  cachedUserEmail = null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const session = await browser.storage.local.get(['accessToken', 'credentials']);
  return !!(session.accessToken && session.credentials);
}

/**
 * Get current credentials
 */
export async function getCredentials() {
  const session = await browser.storage.local.get(['credentials']);
  return session.credentials || null;
}

/**
 * Get Cognito configuration
 */
export async function getCognitoConfig() {
  const result = await browser.storage.local.get(['cognitoConfig']);
  return result.cognitoConfig || null;
}
