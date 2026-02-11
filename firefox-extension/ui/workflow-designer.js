// Import AWS SDK v3 modules
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import CognitoAuth from './auth-sdk.js';
import '../core/workflow-manager.js';

console.log('Workflow Designer: Script loaded with AWS SDK v3');

// Workflow Designer functionality
let selectedFile = null;
let generatedWorkflow = null;

console.log('Workflow Designer: Variables initialized');

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Workflow Designer: DOMContentLoaded fired');
    
    // Check authentication
    const session = await browser.storage.local.get(['credentials', 'username']);
    console.log('Session check:', session);
    
    if (!session.credentials) {
        console.log('No credentials, redirecting to auth');
        window.location.href = 'auth.html';
        return;
    }

    // Check if in edit mode
    const editSession = await browser.storage.local.get(['editingWorkflow', 'editMode']);
    if (editSession.editMode && editSession.editingWorkflow) {
        console.log('Edit mode detected');
        // Load workflow for editing
        loadWorkflowForEditing(editSession.editingWorkflow);
        // Clear edit mode from session
        browser.storage.local.remove(['editingWorkflow', 'editMode']);
        return;
    }

    console.log('Setting up file upload handlers');
    // Setup file upload handlers
    setupFileUpload();
    
    // Restore workflow if returning from test mode
    restoreWorkflowFromTestMode();
    
    console.log('Adding generate button listener');
    // Add generate button listener
    const generateButton = document.getElementById('generateButton');
    
    if (generateButton) {
        generateButton.addEventListener('click', generateWorkflow);
        console.log('Generate button listener added');
    } else {
        console.error('generateButton not found');
    }
    
    console.log('Workflow Designer: Setup complete');
});

function loadWorkflowForEditing(workflow) {
    console.log('Loading workflow for editing:', workflow);
    
    // Hide upload section
    const uploadSection = document.getElementById('uploadSection');
    if (uploadSection) {
        uploadSection.style.display = 'none';
    }
    
    // Show workflow output section
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.style.display = 'block';
    }
    
    // Display workflow JSON
    const workflowOutput = document.getElementById('workflowOutput');
    if (workflowOutput) {
        // Create a single-workflow structure for display
        const displayWorkflow = {
            workflows: [workflow]
        };
        workflowOutput.textContent = JSON.stringify(displayWorkflow, null, 2);
    }
    
    // Store workflow for saving
    window.currentEditingWorkflow = workflow;
    
    // Show action buttons
    setupActionButtons();
}

function setupFileUpload() {
    console.log('setupFileUpload called');
    const uploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('documentUpload');
    
    console.log('Upload elements:', {
        uploadArea: !!uploadArea,
        fileInput: !!fileInput
    });
    
    if (!uploadArea || !fileInput) {
        console.error('Upload area or file input not found');
        return;
    }
    
    // Click handler to trigger file input
    uploadArea.addEventListener('click', (e) => {
        console.log('Upload area clicked!');
        e.preventDefault();
        e.stopPropagation();
        fileInput.click();
    });
    
    // Drag and drop handlers
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelection(files[0]);
        }
    });
    
    // File input change handler
    fileInput.addEventListener('change', (e) => {
        console.log('File input changed');
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });
    
    console.log('File upload handlers setup complete');
}

function handleFileSelection(file) {
    // Validate file type
    const allowedTypes = ['.pdf', '.docx', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
        showError('Please select a PDF, DOCX, or TXT file.');
        return;
    }
    
    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
        showError('File size must be less than 10MB.');
        return;
    }
    
    selectedFile = file;
    
    // Show file info
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('generateButton').disabled = false;
    
    hideError();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function generateWorkflow() {
    if (!selectedFile) {
        showError('Please select a document first.');
        return;
    }
    
    const generateButton = document.getElementById('generateButton');
    
    try {
        // Disable button during processing
        generateButton.disabled = true;
        
        // Clear previous results
        hideResults();
        
        // Show progress
        showProgress();
        updateProgress(10, 'Initializing authentication...');
        
        // Initialize auth
        const auth = new CognitoAuth();
        
        updateProgress(20, 'Uploading document to S3...');
        
        // Upload document to S3
        const s3Key = await uploadDocumentToS3(selectedFile);
        updateProgress(40, 'Document uploaded. Nova Pro is analyzing...');
        
        // Generate workflow using Nova Pro
        const workflow = await analyzeDocumentWithAI(s3Key, 'nova-pro');
        updateProgress(90, 'Finalizing workflow...');
        
        // Display results
        generatedWorkflow = workflow;
        displayWorkflowResults(workflow);
        updateProgress(100, 'Complete!');
        
        setTimeout(() => {
            hideProgress();
            showResults();
            // Re-enable button after completion
            document.getElementById('generateButton').disabled = false;
        }, 1000);
        
    } catch (error) {
        console.error('Workflow generation failed:', error);
        hideProgress();
        showError('Failed to generate workflow: ' + error.message);
        // Re-enable button after error
        document.getElementById('generateButton').disabled = false;
    }
}

async function uploadDocumentToS3(file) {
    try {
        // Get configuration and credentials
        const config = await browser.storage.local.get(['cognitoConfig']);
        const session = await browser.storage.local.get(['credentials']);
        
        if (!session.credentials || !config.cognitoConfig) {
            throw new Error('AWS credentials not available');
        }
        
        // Generate unique S3 key
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const key = `workflow-documents/${timestamp}-${file.name}`;
        
        // Convert file to Uint8Array
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Use AWS SDK v3
        const s3Client = new S3Client({
            region: config.cognitoConfig.region,
            credentials: {
                accessKeyId: session.credentials.AccessKeyId,
                secretAccessKey: session.credentials.SecretKey,
                sessionToken: session.credentials.SessionToken
            }
        });
        
        // Upload parameters
        const command = new PutObjectCommand({
            Bucket: config.cognitoConfig.s3BucketName,
            Key: key,
            Body: uint8Array,
            ContentType: file.type || 'application/octet-stream'
        });
        
        // Upload to S3
        const result = await s3Client.send(command);
        console.log('Document uploaded to S3:', key);
        
        return key;
        
    } catch (error) {
        console.error('S3 upload failed:', error);
        throw new Error('Failed to upload document: ' + error.message);
    }
}

async function analyzeDocumentWithAI(s3Key, modelType) {
    try {
        // Extract actual text from the uploaded document
        const documentText = await extractDocumentText(selectedFile);
        console.log('Document text extracted, length:', documentText.length);
        
        // Get config and credentials for S3 access
        const config = await browser.storage.local.get(['cognitoConfig']);
        const session = await browser.storage.local.get(['credentials']);
        
        if (!config.cognitoConfig || !session.credentials) {
            throw new Error('Configuration or credentials not found');
        }
        
        const region = config.cognitoConfig.region;
        const s3BucketName = config.cognitoConfig.s3BucketName;
        const credentials = session.credentials;
        
        // Fetch workflow designer prompt from S3 using AWS SDK v3
        let analysisPrompt;
        try {
            console.log('Fetching workflow designer prompt from S3');
            
            // Use AWS SDK v3
            const s3Client = new S3Client({
                region: region,
                credentials: {
                    accessKeyId: credentials.AccessKeyId,
                    secretAccessKey: credentials.SecretKey,
                    sessionToken: credentials.SessionToken
                }
            });

            const command = new GetObjectCommand({
                Bucket: s3BucketName,
                Key: 'config/prompts/workflow-designer-prompt.txt'
            });
            
            const result = await s3Client.send(command);
            const bodyContents = await result.Body.transformToString();
            analysisPrompt = bodyContents;
            console.log('Loaded workflow designer prompt from S3');
            
            // Replace placeholder with actual document text
            analysisPrompt = analysisPrompt.replace('{{DOCUMENT_TEXT}}', documentText);
        } catch (error) {
            console.error('Failed to load prompt from S3:', error);
            throw new Error('Workflow designer prompt not available. Please ensure prompts are uploaded to S3.');
        }
        
        // Use CognitoAuth to call Nova Pro directly
        const auth = new CognitoAuth();
        
        console.log('Document text being sent to AI:', documentText.substring(0, 200) + '...');
        console.log('Full document length:', documentText.length);
        console.log('Sending document analysis request to Nova Pro...');
        const response = await auth.callBedrockAPI(analysisPrompt);
        
        console.log('Nova Pro response:', response);
        
        // Parse the workflow from Nova Pro response
        const workflow = parseWorkflowFromResponse(response);
        return workflow;
        
    } catch (error) {
        console.error('Document analysis failed:', error);
        throw new Error('Failed to analyze document: ' + error.message);
    }
}

function parseWorkflowFromResponse(response) {
    let jsonText = ''; // Declare at function scope so catch block can access it
    
    try {
        console.log('Parsing AI response:', response);
        
        let responseText = '';
        
        // Handle different response formats from Nova Pro
        if (typeof response === 'string') {
            responseText = response;
        } else if (response.output?.message?.content) {
            // Extract text from Nova Pro response structure
            for (const item of response.output.message.content) {
                if (item.text) {
                    responseText += item.text;
                }
            }
        } else if (response.message) {
            responseText = response.message;
        } else {
            responseText = JSON.stringify(response);
        }
        
        console.log('Extracted response text length:', responseText.length);
        console.log('First 1000 chars:', responseText.substring(0, 1000));
        console.log('Last 500 chars:', responseText.substring(responseText.length - 500));
        
        // Try to extract JSON from the response
        jsonText = responseText;
        
        // Look for JSON block in the response - be more aggressive
        const jsonMatch = responseText.match(/\{[\s\S]*"workflows"[\s\S]*\}/);
        if (jsonMatch) {
            jsonText = jsonMatch[0];
        } else {
            // Try to find just the workflows array
            const workflowMatch = responseText.match(/"workflows"\s*:\s*\[[\s\S]*\]/);
            if (workflowMatch) {
                jsonText = `{${workflowMatch[0]}}`;
            }
        }
        
        // Clean up common AI response artifacts
        jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '');
        jsonText = jsonText.replace(/\\"/g, '"'); // Fix escaped quotes
        jsonText = jsonText.replace(/\\n/g, '\n'); // Fix escaped newlines
        jsonText = jsonText.trim();
        
        // Try to fix common JSON issues - multiple passes for better results
        let previousText = '';
        let attempts = 0;
        while (previousText !== jsonText && attempts < 3) {
            previousText = jsonText;
            jsonText = fixCommonJSONIssues(jsonText);
            attempts++;
        }
        
        // Apply line-by-line repair
        jsonText = repairJSON(jsonText);
        
        // One more pass of fixes after repair
        jsonText = fixCommonJSONIssues(jsonText);
        
        console.log('Cleaned JSON text (after ' + attempts + ' passes + repair):', jsonText.substring(0, 500) + '...');
        console.log('Around position 4275:', jsonText.substring(4200, 4350));
        
        // Parse JSON
        const workflow = JSON.parse(jsonText);
        
        // Validate workflow structure
        if (!workflow.workflows || !Array.isArray(workflow.workflows)) {
            throw new Error('Invalid workflow structure');
        }
        
        console.log('Successfully parsed workflow:', workflow);
        return workflow;
        
    } catch (error) {
        console.error('Failed to parse workflow JSON:', error);
        console.log('Raw response was:', response);
        console.log('Attempted JSON text:', jsonText);
        
        // Try to extract partial workflow information for manual editing
        let partialWorkflow = "Could not parse JSON automatically. ";
        let rawJsonForEditing = jsonText || '';
        
        if (typeof response === 'object' && response.output?.message?.content) {
            const text = response.output.message.content[0]?.text || '';
            if (text.includes('GitHub') || text.includes('workflows')) {
                partialWorkflow += "AI generated workflow content detected. ";
            }
            // Store the raw JSON for editing
            if (!rawJsonForEditing && text) {
                rawJsonForEditing = text;
            }
        }
        
        partialWorkflow += `\n\nError: ${error.message}\n\nClick 'Edit Workflow' below to manually fix the JSON format. The raw AI response is shown in the workflow output.`;
        
        // Return a structure that shows the error and raw JSON
        return {
            workflows: [{
                name: "⚠️ JSON Parse Error - Manual Fix Required",
                description: partialWorkflow,
                steps: [
                    {
                        action: "wait_for_user",
                        description: "Review the JSON output below, fix any syntax errors, then click 'Save Edits' to validate."
                    }
                ]
            }],
            _rawJson: rawJsonForEditing,
            _parseError: error.message
        };
    }
}

function fixCommonJSONIssues(jsonText) {
    try {
        // Step 1: Remove trailing commas before closing brackets/braces
        jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');
        
        // Step 2: Fix missing commas between consecutive objects in arrays
        // Pattern: } followed by whitespace and { (most common issue)
        jsonText = jsonText.replace(/}(\s+)\{/g, '},$1{');
        
        // Step 3: Fix missing commas after closing brace before opening brace (no whitespace)
        jsonText = jsonText.replace(/}\{/g, '},{');
        
        // Step 4: Fix missing commas between object properties
        // Pattern: "value" followed by newline and "key":
        jsonText = jsonText.replace(/("(?:[^"\\]|\\.)*")(\s*\n\s*)("(?:[^"\\]|\\.)*"\s*:)/g, '$1,$2$3');
        
        // Step 5: Fix missing commas after boolean/number values before next property
        jsonText = jsonText.replace(/(true|false|\d+)(\s*\n\s*)("(?:[^"\\]|\\.)*"\s*:)/g, '$1,$2$3');
        
        // Step 6: Fix missing commas after closing bracket before opening brace
        jsonText = jsonText.replace(/\](\s*)\{/g, '],$1{');
        
        // Step 7: Fix missing commas after closing brace before opening bracket
        jsonText = jsonText.replace(/}(\s*)\[/g, '},$1[');
        
        // Step 8: Fix missing commas after string ending with quote before next string property
        jsonText = jsonText.replace(/"(\s*\n\s+)"/g, '",$1"');
        
        // Step 9: Remove any double commas created by our fixes
        jsonText = jsonText.replace(/,(\s*),+/g, ',$1');
        
        // Step 10: Final cleanup - remove trailing commas again
        jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');
        
        return jsonText;
    } catch (error) {
        console.log('Error fixing JSON:', error);
        return jsonText;
    }
}

// More aggressive JSON repair - validates structure and adds missing commas
function repairJSON(jsonText) {
    try {
        const lines = jsonText.split('\n');
        const repairedLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
            const trimmedLine = line.trim();
            
            // Check if current line ends with } or ] and next line starts with { or "
            if (trimmedLine.endsWith('}') && !trimmedLine.endsWith(',') && !trimmedLine.endsWith('{')) {
                if (nextLine.startsWith('{') || nextLine.startsWith('"')) {
                    // Add comma before the closing brace
                    line = line.replace(/}(\s*)$/, '},$1');
                }
            }
            
            repairedLines.push(line);
        }
        
        return repairedLines.join('\n');
    } catch (error) {
        console.log('Error in repairJSON:', error);
        return jsonText;
    }
}

function displayWorkflowResults(workflow) {
    // Generate summary
    const workflowCount = workflow.workflows ? workflow.workflows.length : 0;
    let summaryHTML = `<div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 6px; padding: 12px; margin-bottom: 16px;">`;
    
    // Check if this is an error workflow
    if (workflow._parseError) {
        summaryHTML = `<div style="background: #fef2f2; border: 1px solid #ef4444; border-radius: 6px; padding: 12px; margin-bottom: 16px;">`;
        summaryHTML += `<div style="color: #dc2626; font-weight: 600; margin-bottom: 8px;">⚠️ JSON Parse Error</div>`;
        summaryHTML += `<div style="color: #374151; margin-left: 8px; font-size: 12px;">${workflow._parseError}</div>`;
        summaryHTML += `<div style="color: #374151; margin-left: 8px; margin-top: 8px; font-size: 12px;">The raw JSON is shown below. Click "Edit Workflow" to fix syntax errors.</div>`;
        summaryHTML += `</div>`;
    } else {
        summaryHTML += `<div style="color: #0ea5e9; font-weight: 600; margin-bottom: 8px;">✅ Generated ${workflowCount} workflow${workflowCount !== 1 ? 's' : ''} from your document:</div>`;
        
        if (workflow.workflows) {
            workflow.workflows.forEach(wf => {
                const stepCount = wf.steps ? wf.steps.length : 0;
                const actionTypes = wf.steps ? [...new Set(wf.steps.map(step => step.action))].slice(0, 3) : [];
                const actionText = actionTypes.length > 0 ? actionTypes.join(', ') : 'various actions';
                summaryHTML += `<div style="color: #374151; margin-left: 8px;">• "${wf.name}" (${stepCount} steps: ${actionText}${actionTypes.length > 3 ? ', ...' : ''})</div>`;
            });
        }
        summaryHTML += `</div>`;
    }
    
    // Update the results section
    const resultsSection = document.getElementById('resultsSection');
    const reviewText = resultsSection.querySelector('p');
    
    // Insert summary before the review text
    reviewText.insertAdjacentHTML('beforebegin', summaryHTML);
    
    // Display JSON output - show raw JSON if parse error, otherwise formatted workflow
    const output = document.getElementById('workflowOutput');
    if (workflow._rawJson) {
        output.textContent = workflow._rawJson;
    } else {
        output.textContent = JSON.stringify(workflow, null, 2);
    }
}

function showProgress() {
    document.getElementById('progressSection').style.display = 'block';
}

function hideProgress() {
    document.getElementById('progressSection').style.display = 'none';
}

function updateProgress(percentage, text) {
    document.getElementById('progressFill').style.width = percentage + '%';
    document.getElementById('progressText').textContent = text;
    
    // Auto-scroll to progress section
    const progressSection = document.getElementById('progressSection');
    if (progressSection) {
        progressSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function showResults() {
    document.getElementById('resultsSection').style.display = 'block';
    // Setup action button event listeners now that they're visible
    setupActionButtons();
}

function hideResults() {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.style.display = 'none';
    
    // Clear previous summary and output
    const summaryDivs = resultsSection.querySelectorAll('div[style*="background: #f0f9ff"]');
    summaryDivs.forEach(div => div.remove());
    
    const output = document.getElementById('workflowOutput');
    if (output) {
        output.textContent = '';
    }
}

function restoreWorkflowFromTestMode() {
    const isTestMode = sessionStorage.getItem('testMode');
    const workflowData = sessionStorage.getItem('designerWorkflow');
    const referrer = document.referrer;
    
    console.log('Workflow Designer - Restore check:', { 
        isTestMode, 
        hasWorkflowData: !!workflowData, 
        referrer,
        sessionStorageKeys: Object.keys(sessionStorage)
    });
    
    // Check if we're coming from sidepanel (test mode) or have test mode data
    const shouldRestore = (isTestMode === 'true' && workflowData) || 
                         (workflowData && referrer.includes('sidepanel.html'));
    
    console.log('Should restore workflow:', shouldRestore);
    
    if (shouldRestore) {
        try {
            const workflow = JSON.parse(workflowData);
            generatedWorkflow = workflow;
            
            console.log('Restored workflow:', workflow);
            
            // Hide the upload section since we have a workflow
            const uploadSection = document.querySelector('.section');
            if (uploadSection) {
                uploadSection.style.display = 'none';
                console.log('Upload section hidden');
            }
            
            // Show the results section with the restored workflow
            displayWorkflowResults(workflow);
            showResults();
            console.log('Results section shown');
            
            // Automatically enter edit mode when coming from test
            setTimeout(() => {
                console.log('Entering edit mode');
                editWorkflow();
            }, 100);
            
            console.log('Workflow restored and edit mode activated');
            
        } catch (error) {
            console.error('Failed to restore workflow from test mode:', error);
        }
    } else {
        console.log('No workflow to restore');
    }
}

function setupActionButtons() {
    // These will be set up when results section is shown
    setTimeout(() => {
        const editBtn = document.getElementById('editWorkflowBtn');
        const saveBtn = document.getElementById('saveWorkflowBtn');
        const testBtn = document.getElementById('testWorkflowBtn');
        
        if (editBtn && !editBtn.hasAttribute('data-listener')) {
            editBtn.addEventListener('click', editWorkflow);
            editBtn.setAttribute('data-listener', 'true');
        }
        if (saveBtn && !saveBtn.hasAttribute('data-listener')) {
            saveBtn.addEventListener('click', saveWorkflow);
            saveBtn.setAttribute('data-listener', 'true');
        }
        if (testBtn && !testBtn.hasAttribute('data-listener')) {
            testBtn.addEventListener('click', testWorkflow);
            testBtn.setAttribute('data-listener', 'true');
        }
    }, 100);
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function editWorkflow() {
    const output = document.getElementById('workflowOutput');
    const actionButtons = document.querySelector('.action-buttons');
    
    // Check if already in edit mode
    if (output.contentEditable === 'true') {
        return; // Already editing, don't create duplicate button
    }
    
    output.contentEditable = true;
    output.style.border = '2px solid #3b82f6';
    
    // Check if Save Edits button already exists
    let saveEditButton = actionButtons.querySelector('.save-edit-btn');
    if (!saveEditButton) {
        saveEditButton = document.createElement('button');
        saveEditButton.className = 'save-edit-btn';
        saveEditButton.textContent = 'Save Edits';
        saveEditButton.onclick = () => {
            try {
                generatedWorkflow = JSON.parse(output.textContent);
                output.contentEditable = false;
                output.style.border = 'none';
                saveEditButton.remove();
                showError(''); // Clear any errors
                hideError();
            } catch (error) {
                showError('Invalid JSON format. Please fix the syntax.');
            }
        };
        
        actionButtons.appendChild(saveEditButton);
    }
}

async function saveWorkflow() {
    // Check if editing existing workflow
    console.log('saveWorkflow called, currentEditingWorkflow:', window.currentEditingWorkflow);
    
    if (window.currentEditingWorkflow) {
        try {
            // Get updated workflow from JSON editor
            const workflowOutput = document.getElementById('workflowOutput').textContent;
            const parsed = JSON.parse(workflowOutput);
            const updatedWorkflow = parsed.workflows[0];
            
            console.log('Updating workflow:', window.currentEditingWorkflow.name, 'with:', updatedWorkflow);
            
            // Update workflow in manager
            const workflowManager = new window.WorkflowManager();
            await workflowManager.loadWorkflows();
            await workflowManager.updateWorkflow(window.currentEditingWorkflow.name, updatedWorkflow);
            
            alert('Workflow updated successfully!');
            window.location.href = 'sidepanel.html';
            return;
        } catch (error) {
            console.error('Update workflow error:', error);
            showError('Failed to update workflow: ' + error.message);
            return;
        }
    }
    
    console.log('No currentEditingWorkflow, treating as new workflow');
    
    // Original save logic for new workflows
    if (!generatedWorkflow) {
        showError('No workflow to save');
        return;
    }
    
    try {
        // Save to existing workflow configuration
        const workflowManager = new window.WorkflowManager();
        await workflowManager.loadWorkflows();
        
        // Add the generated workflow
        for (const workflow of generatedWorkflow.workflows) {
            await workflowManager.addWorkflow(workflow);
        }
        
        alert('Workflow saved successfully! You can now use it in the Evidence Collector.');
    } catch (error) {
        showError('Failed to save workflow: ' + error.message);
    }
}

function testWorkflow() {
    // Check if editing existing workflow
    if (window.currentEditingWorkflow) {
        try {
            // Get updated workflow from JSON editor
            const workflowOutput = document.getElementById('workflowOutput').textContent;
            const parsed = JSON.parse(workflowOutput);
            generatedWorkflow = parsed; // Set for test mode
        } catch (error) {
            showError('Invalid JSON: ' + error.message);
            return;
        }
    }
    
    if (!generatedWorkflow) {
        showError('No workflow to test');
        return;
    }
    
    // Store test mode and workflow data in session
    sessionStorage.setItem('testMode', 'true');
    sessionStorage.setItem('designerWorkflow', JSON.stringify(generatedWorkflow));
    
    // Navigate to evidence collector with the generated workflow
    const workflowData = encodeURIComponent(JSON.stringify(generatedWorkflow));
    window.location.href = `sidepanel.html?testWorkflow=${workflowData}`;
}

// Add function to extract text from the selected file
async function extractDocumentText(file) {
    if (!file) {
        throw new Error('No file selected for text extraction');
    }
    
    try {
        // Simple text extraction for now
        const text = await file.text();
        console.log('Extracted document text length:', text.length);
        return text;
    } catch (error) {
        console.error('Document text extraction failed:', error);
        throw new Error('Failed to extract text from document: ' + error.message);
    }
}
