// Cognito Helper using AWS SDK v3
import { 
  CognitoIdentityProviderClient, 
  GetUserCommand 
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Get user email from Cognito using access token
 * @param {string} accessToken - Cognito access token
 * @param {string} region - AWS region
 * @returns {Promise<string|null>} User email or null
 */
export async function getUserEmail(accessToken, region) {
  try {
    const client = new CognitoIdentityProviderClient({ region });
    
    const command = new GetUserCommand({
      AccessToken: accessToken
    });

    const response = await client.send(command);
    
    // Extract email from user attributes
    const emailAttr = response.UserAttributes?.find(attr => attr.Name === 'email');
    return emailAttr?.Value || null;
    
  } catch (error) {
    console.error('Failed to get user email:', error);
    return null;
  }
}

/**
 * Get user email with caching
 * Uses chrome.storage.session to cache the email
 */
export async function getCachedUserEmail() {
  const config = await chrome.storage.local.get(['cognitoConfig']);
  const session = await chrome.storage.session.get(['userEmail', 'accessToken']);
  
  // Return cached email if available
  if (session.userEmail) {
    return session.userEmail;
  }
  
  // Fetch from Cognito if not cached
  if (session.accessToken && config.cognitoConfig) {
    const userEmail = await getUserEmail(
      session.accessToken, 
      config.cognitoConfig.region
    );
    
    // Cache the email
    if (userEmail) {
      await chrome.storage.session.set({ userEmail });
    }
    
    return userEmail;
  }
  
  return null;
}
