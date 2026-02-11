// S3 Helper using AWS SDK v3
import { 
  S3Client, 
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';

/**
 * Create S3 client with credentials
 */
function createS3Client(credentials, region) {
  return new S3Client({
    region: region,
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretKey,
      sessionToken: credentials.SessionToken
    }
  });
}

/**
 * Upload file to S3
 * @param {string} bucketName - S3 bucket name
 * @param {string} key - S3 object key
 * @param {Buffer|Blob|string} body - File content
 * @param {object} credentials - AWS credentials
 * @param {string} region - AWS region
 * @param {string} contentType - Content type (optional)
 */
export async function uploadToS3(bucketName, key, body, credentials, region, contentType = 'application/octet-stream') {
  try {
    const client = createS3Client(credentials, region);
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType
    });

    const response = await client.send(command);
    console.log('S3 upload successful:', key);
    return response;
    
  } catch (error) {
    console.error('S3 upload failed:', error);
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

/**
 * Download file from S3
 * @param {string} bucketName - S3 bucket name
 * @param {string} key - S3 object key
 * @param {object} credentials - AWS credentials
 * @param {string} region - AWS region
 */
export async function downloadFromS3(bucketName, key, credentials, region) {
  try {
    const client = createS3Client(credentials, region);
    
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    const response = await client.send(command);
    
    // Convert stream to string
    const bodyContents = await streamToString(response.Body);
    return bodyContents;
    
  } catch (error) {
    console.error('S3 download failed:', error);
    throw new Error(`Failed to download from S3: ${error.message}`);
  }
}

/**
 * List objects in S3 bucket
 * @param {string} bucketName - S3 bucket name
 * @param {string} prefix - Object key prefix
 * @param {object} credentials - AWS credentials
 * @param {string} region - AWS region
 */
export async function listS3Objects(bucketName, prefix, credentials, region) {
  try {
    const client = createS3Client(credentials, region);
    
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix
    });

    const response = await client.send(command);
    return response.Contents || [];
    
  } catch (error) {
    console.error('S3 list failed:', error);
    throw new Error(`Failed to list S3 objects: ${error.message}`);
  }
}

/**
 * Helper function to convert stream to string
 */
async function streamToString(stream) {
  // Use transformToString method provided by AWS SDK v3
  if (stream.transformToString) {
    return await stream.transformToString();
  }
  
  // Fallback: convert to byte array first
  const chunks = [];
  const reader = stream.getReader ? stream.getReader() : stream;
  
  if (reader.read) {
    // ReadableStream
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } else {
    // Async iterable
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
  }
  
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Upload screenshot to S3 with proper naming
 * @param {string} dataUrl - Screenshot data URL
 * @param {string} workflowName - Workflow name
 * @param {string} stepDescription - Step description
 */
export async function uploadScreenshot(dataUrl, workflowName, stepDescription) {
  try {
    // Get credentials and config
    const session = await chrome.storage.session.get(['credentials']);
    const config = await chrome.storage.local.get(['cognitoConfig']);
    
    if (!session.credentials || !config.cognitoConfig) {
      throw new Error('Not authenticated');
    }

    // Convert data URL to blob, then to Uint8Array for AWS SDK
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                     now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const sanitizedWorkflow = workflowName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const sanitizedStep = stepDescription.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 50);
    
    // Create S3 key with date-based folder structure
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const key = `evidence/${year}/${month}/${day}/${sanitizedWorkflow}/${timestamp}_${sanitizedStep}.png`;
    
    // Upload to S3 using Uint8Array
    await uploadToS3(
      config.cognitoConfig.s3BucketName,
      key,
      uint8Array,
      session.credentials,
      config.cognitoConfig.region,
      'image/png'
    );
    
    return {
      success: true,
      key: key,
      url: `s3://${config.cognitoConfig.s3BucketName}/${key}`
    };
    
  } catch (error) {
    console.error('Screenshot upload failed:', error);
    throw error;
  }
}

/**
 * S3Manager class for backward compatibility with existing code
 * Wraps the functional API in a class-based interface
 */
export class S3Manager {
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
    const config = await chrome.storage.local.get(['cognitoConfig']);
    const session = await chrome.storage.session.get(['credentials']);
    
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
    return text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 50);
  }

  generateFilename(url, stepDescription = 'screenshot', workflowName = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const domain = new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '-');
    const sanitizedDescription = this.sanitizeForFilename(stepDescription);
    return `${timestamp}_${domain}_${sanitizedDescription}.png`;
  }

  async uploadScreenshot(screenshotBase64, url, stepDescription = 'screenshot', workflowName = null) {
    await this.initialize();
    
    let uploadPath = this.todayFolder;
    if (workflowName) {
      const sanitizedWorkflow = this.sanitizeForFilename(workflowName);
      uploadPath = `${uploadPath}/${sanitizedWorkflow}`;
    }
    
    const filename = this.generateFilename(url, stepDescription, workflowName);
    const key = `${uploadPath}/${filename}`;
    
    // Use the functional API
    const result = await uploadScreenshot(screenshotBase64, workflowName, stepDescription);
    
    // Extract filename from the key
    const uploadedFilename = result.key.split('/').pop();
    
    // Return result with filename added
    return {
      ...result,
      filename: uploadedFilename
    };
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
    
    const body = JSON.stringify(chatData, null, 2);
    await uploadToS3(
      this.config.s3BucketName,
      key,
      body,
      this.credentials,
      this.config.region,
      'application/json'
    );
    
    return { filename, s3Url: `s3://${this.config.s3BucketName}/${key}` };
  }

  async saveWorkflowLog(workflowLog) {
    await this.initialize();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedWorkflow = this.sanitizeForFilename(workflowLog.workflowName);
    const filename = `workflow-${sanitizedWorkflow}-${workflowLog.username}-${timestamp}.json`;
    const key = `chat-logs/${this.todayFolder.split('/').slice(1).join('/')}/${filename}`;
    
    const body = JSON.stringify(workflowLog, null, 2);
    await uploadToS3(
      this.config.s3BucketName,
      key,
      body,
      this.credentials,
      this.config.region,
      'application/json'
    );
    
    return { filename, s3Url: `s3://${this.config.s3BucketName}/${key}` };
  }

  async saveReport(reportHTML, workflowName) {
    await this.initialize();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedWorkflow = this.sanitizeForFilename(workflowName);
    const filename = `${sanitizedWorkflow}-report-${timestamp}.html`;
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const key = `reports/${year}/${month}/${day}/${filename}`;
    
    await uploadToS3(
      this.config.s3BucketName,
      key,
      reportHTML,
      this.credentials,
      this.config.region,
      'text/html'
    );
    
    return `s3://${this.config.s3BucketName}/${key}`;
  }

  async loadWorkflowsFromS3() {
    await this.initialize();
    
    const key = 'config/workflows/user-workflows.json';
    
    try {
      const data = await downloadFromS3(
        this.config.s3BucketName,
        key,
        this.credentials,
        this.config.region
      );
      
      const workflows = JSON.parse(data);
      return workflows;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async saveWorkflowsToS3(workflows) {
    await this.initialize();
    
    const key = 'config/workflows/user-workflows.json';
    
    // Create backup first
    try {
      await this.createWorkflowBackup();
    } catch (backupError) {
      console.warn('Failed to create backup:', backupError.message);
    }
    
    const body = JSON.stringify(workflows, null, 2);
    await uploadToS3(
      this.config.s3BucketName,
      key,
      body,
      this.credentials,
      this.config.region,
      'application/json'
    );
    
    return { success: true, location: `s3://${this.config.s3BucketName}/${key}` };
  }

  async createWorkflowBackup() {
    const sourceKey = 'config/workflows/user-workflows.json';
    
    try {
      const existingData = await downloadFromS3(
        this.config.s3BucketName,
        sourceKey,
        this.credentials,
        this.config.region
      );
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupKey = `config/workflows/backups/user-workflows-${timestamp}.json`;
      
      await uploadToS3(
        this.config.s3BucketName,
        backupKey,
        existingData,
        this.credentials,
        this.config.region,
        'application/json'
      );
      
      console.log('✅ Workflow backup created:', backupKey);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.log('No existing workflows to backup');
      } else {
        throw error;
      }
    }
  }
}


// Make S3Manager globally available for non-module contexts
if (typeof window !== 'undefined') {
  window.S3Manager = S3Manager;
}
