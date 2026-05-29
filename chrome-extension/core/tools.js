class EvidenceTools {
  constructor(components) {
    this.components = components;
    this.tools = [
      {
        tool_name: "SearchWebsite",
        description: "Search for elements on the current webpage using natural language",
        inputSchema: {
          json: JSON.stringify({
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Natural language description of what to find (e.g., 'login button', 'search box', 'submit form')"
              }
            },
            required: ["query"]
          })
        },
        script: this.searchWebsite.bind(this),
        run_after_app_init: false,
        order: 1
      },
      {
        tool_name: "NavigateToURL",
        description: "Navigate to a specific URL or website",
        inputSchema: {
          json: JSON.stringify({
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL to navigate to (e.g., 'github.com', 'https://github.com/user/repo')"
              }
            },
            required: ["url"]
          })
        },
        script: this.navigateToURL.bind(this),
        run_after_app_init: false,
        order: 2
      },
      {
        tool_name: "GitHubSearch",
        description: "Search for GitHub repositories by name or keywords",
        inputSchema: {
          json: JSON.stringify({
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search terms for the repository (e.g., 'conversational athena', 'bedrock samples')"
              }
            },
            required: ["query"]
          })
        },
        script: this.githubSearch.bind(this),
        run_after_app_init: false,
        order: 3
      },
      {
        tool_name: "ClickElement",
        description: "Click on an element found on the current page",
        inputSchema: {
          json: JSON.stringify({
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Description of element to click (e.g., 'first repository link', 'login button')"
              }
            },
            required: ["description"]
          })
        },
        script: this.clickElement.bind(this),
        run_after_app_init: false,
        order: 4
      },
      {
        tool_name: "TakeScreenshot",
        description: "Take a screenshot of the current page",
        inputSchema: {
          json: JSON.stringify({
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Optional description for the screenshot"
              }
            }
          })
        },
        script: this.takeScreenshot.bind(this),
        run_after_app_init: false,
        order: 5
      },
      {
        tool_name: "SelectCheckbox",
        description: "Select or deselect checkboxes with state detection and validation",
        inputSchema: {
          json: JSON.stringify({
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Description of the checkbox to select (e.g., 'terms and conditions', 'select all', 'privacy policy')"
              },
              action: {
                type: "string",
                enum: ["check", "uncheck", "toggle"],
                description: "Action to perform: check (select), uncheck (deselect), or toggle (switch state)",
                default: "check"
              }
            },
            required: ["description"]
          })
        },
        script: this.selectCheckbox.bind(this),
        run_after_app_init: false,
        order: 5.5
      },
      {
        tool_name: "ShowCheckboxes",
        description: "Find and list all checkboxes on the current page with their descriptions",
        inputSchema: {
          json: JSON.stringify({
            type: "object",
            properties: {}
          })
        },
        script: this.showCheckboxes.bind(this),
        run_after_app_init: false,
        order: 5.6
      },
      {
        tool_name: "TypeText",
        description: "Type text into an input field or search box on the current page",
        inputSchema: {
          json: JSON.stringify({
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
          })
        },
        script: this.typeText.bind(this),
        run_after_app_init: false,
        order: 6
      },
      {
        tool_name: "ScrollPage",
        description: "Scroll the page up or down",
        inputSchema: {
          json: JSON.stringify({
            type: "object",
            properties: {
              direction: {
                type: "string",
                enum: ["up", "down"],
                description: "Direction to scroll (up or down)"
              },
              amount: {
                type: "string",
                enum: ["small", "medium", "large", "top", "bottom"],
                description: "Amount to scroll (small, medium, large, top, bottom)"
              }
            },
            required: ["direction"]
          })
        },
        script: this.scrollPage.bind(this),
        run_after_app_init: false,
        order: 7
      }
    ];
  }

  async takeScreenshot(args) {
    const { input, toolName } = args;
    console.log(`Tool::Script::${toolName} executed with input:`, input);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Retry logic for screenshot capture
      let screenshot;
      let retries = 3;
      while (retries > 0) {
        try {
          screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
          break;
        } catch (captureError) {
          retries--;
          if (retries === 0) throw captureError;
          console.log(`Screenshot capture failed, retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
        }
      }
      
      const timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
      
      // Add timestamp overlay to image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = async () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          
          // Add timestamp overlay
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(10, 10, 200, 30);
          ctx.fillStyle = 'white';
          ctx.font = '14px Arial';
          ctx.fillText(timestamp, 15, 30);
          
          const finalScreenshot = canvas.toDataURL('image/png');
          
          // Upload to S3 with workflow context
          try {
            const s3Manager = new window.S3Manager();
            const workflowName = input?.workflowName || null;
            const stepDescription = input?.stepDescription || 'screenshot';
            const result = await s3Manager.uploadScreenshot(finalScreenshot, tab.url, stepDescription, workflowName);
            
            resolve(JSON.stringify({
              success: true,
              message: `Screenshot captured at ${timestamp}. Uploaded to S3: ${result.filename}`,
              screenshot: finalScreenshot,
              s3Upload: result
            }));
          } catch (s3Error) {
            resolve(JSON.stringify({
              success: true,
              message: `Screenshot captured at ${timestamp}. S3 upload failed: ${s3Error.message}`,
              screenshot: finalScreenshot,
              s3Error: s3Error.message
            }));
          }
        };
        img.src = screenshot;
      });
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }



  async captureFullPage(tabId, pageInfo) {
    const viewportHeight = pageInfo.viewportHeight;
    const fullHeight = pageInfo.fullHeight;
    const screenshots = [];
    
    // Reset scroll to top
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.scrollTo(0, 0)
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    let currentScroll = 0;
    
    // Capture all viewport sections
    while (currentScroll < fullHeight) {
      const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      screenshots.push({
        dataUrl: screenshot,
        scrollY: currentScroll
      });
      
      currentScroll += viewportHeight;
      
      if (currentScroll < fullHeight) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (scrollY) => window.scrollTo(0, scrollY),
          args: [Math.min(currentScroll, fullHeight - viewportHeight)]
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Reset scroll to top
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.scrollTo(0, 0)
    });
    
    // Stitch images together using Canvas
    return await this.stitchScreenshots(screenshots, viewportHeight, fullHeight);
  }

  async stitchScreenshots(screenshots, viewportHeight, fullHeight) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to full page dimensions
      canvas.width = window.screen.width; // Approximate viewport width
      canvas.height = fullHeight;
      
      let loadedImages = 0;
      const images = [];
      
      screenshots.forEach((screenshot, index) => {
        const img = new Image();
        img.onload = () => {
          images[index] = img;
          loadedImages++;
          
          if (loadedImages === screenshots.length) {
            // Draw all images onto canvas
            images.forEach((img, i) => {
              const yPosition = i * viewportHeight;
              ctx.drawImage(img, 0, yPosition);
            });
            
            // Convert canvas to data URL
            const stitchedDataUrl = canvas.toDataURL('image/png');
            resolve(stitchedDataUrl);
          }
        };
        img.src = screenshot.dataUrl;
      });
    });
  }

  async clickElement(args) {
    const { input, toolName } = args;
    console.log(`Tool::Script::${toolName} executed with input:`, input);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'clickElement',
        description: input.description
      });

      if (response && response.success) {
        return JSON.stringify({
          success: true,
          message: response.message || `Clicked: ${input.description}`
        });
      } else {
        return JSON.stringify({
          success: false,
          error: response?.error || `Could not find element: ${input.description}`
        });
      }
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  async githubSearch(args) {
    const { input, toolName } = args;
    console.log(`Tool::Script::${toolName} executed with input:`, input);

    try {
      // Navigate to GitHub search
      const searchUrl = `https://github.com/search?q=${encodeURIComponent(input.query)}&type=repositories`;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.update(tab.id, { url: searchUrl });

      // Wait for page to load, then get repository options
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            const response = await chrome.tabs.sendMessage(tab.id, {
              action: 'searchElements',
              query: 'repository'
            });
            
            if (response && response.elements && response.elements.length > 0) {
              const repos = response.elements.slice(0, 5).map((el, i) => 
                `${i+1}. ${el.text.substring(0, 80)}`
              ).join('\n');
              
              resolve(JSON.stringify({
                success: true,
                message: `Found repositories for "${input.query}":\n\n${repos}\n\nTell me which number to click!`,
                repositories: response.elements
              }));
            } else {
              resolve(JSON.stringify({
                success: true,
                message: `Searched for "${input.query}" but still loading results. Try asking "what options" in a moment.`
              }));
            }
          } catch (error) {
            resolve(JSON.stringify({
              success: true,
              message: `Searched for "${input.query}". Page is loading - ask me "what options" in a moment.`
            }));
          }
        }, 4000);
      });
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  async navigateToURL(args) {
    const { input, toolName } = args;
    console.log(`Tool::Script::${toolName} executed with input:`, input);

    try {
      let url = input.url;
      
      // Add https:// if no protocol specified
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      // Update current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.update(tab.id, { url: url });

      return JSON.stringify({
        success: true,
        message: `Navigating to ${url}`,
        url: url
      });
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  async searchWebsite(args) {
    const { input, toolName } = args;
    console.log(`Tool::Script::${toolName} executed with input:`, input);

    try {
      // Send message to content script to search for elements
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'searchElements',
        query: input.query
      });

      if (response && response.elements && response.elements.length > 0) {
        return JSON.stringify({
          success: true,
          elements: response.elements,
          message: `Found ${response.elements.length} matching elements`
        });
      } else {
        return JSON.stringify({
          success: false,
          message: `No elements found matching "${input.query}"`
        });
      }
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  getTools() {
    return this.tools;
  }

  async executeTool(toolName, input) {
    const tool = this.tools.find(t => t.tool_name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    return await tool.script({ input, toolName });
  }

  async showCheckboxes(args) {
    const { toolName } = args;
    console.log(`Tool::Script::${toolName} executed`);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'showCheckboxes'
      });

      if (response.checkboxes.length === 0) {
        return JSON.stringify({
          success: true,
          message: "No checkboxes found on this page."
        });
      }

      const checkboxList = response.checkboxes.map((cb, index) => 
        `${index + 1}. "${cb.text}" (${cb.checked ? 'checked' : 'unchecked'})`
      ).join('\n');

      return JSON.stringify({
        success: true,
        message: `Found ${response.checkboxes.length} checkboxes on this page:\n\n${checkboxList}\n\nUse SelectCheckbox with any of these descriptions to interact with them.`
      });
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  async selectCheckbox(args) {
    const { input, toolName } = args;
    console.log(`Tool::Script::${toolName} executed with input:`, input);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'selectCheckbox',
        description: input.description,
        checkboxAction: input.action || 'check'
      });

      return JSON.stringify({
        success: true,
        message: response.message,
        previousState: response.previousState,
        newState: response.newState,
        element: response.element
      });
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  async typeText(args) {
    const { input, toolName } = args;
    console.log(`Tool::Script::${toolName} executed with input:`, input);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Try to inject content script if not already present
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      } catch (e) {
        // Content script might already be injected, continue
      }
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'typeText',
        text: input.text,
        element: input.element
      });

      if (response && response.success) {
        return JSON.stringify({
          success: true,
          message: `Typed "${input.text}" into ${input.element}`
        });
      } else {
        return JSON.stringify({
          success: false,
          error: response?.error || 'Failed to type text'
        });
      }
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  async scrollPage(args) {
    const { input, toolName } = args;
    console.log(`Tool::Script::${toolName} executed with input:`, input);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'scrollPage',
        direction: input.direction,
        amount: input.amount || 'medium'
      });

      if (response && response.success) {
        return JSON.stringify({
          success: true,
          message: `Scrolled ${input.direction} (${input.amount || 'medium'})`
        });
      } else {
        return JSON.stringify({
          success: false,
          error: response?.error || 'Failed to scroll page'
        });
      }
    } catch (error) {
      console.error(`Tool::Script::${toolName} error:`, error);
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  // Interactive workflow tools
  static async clickElement(input) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'clickElement',
        description: input.description
      });

      return JSON.stringify({
        success: true,
        message: response.message,
        element: response.element
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

  static async selectCheckbox(input) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'selectCheckbox',
        description: input.description,
        checkboxAction: input.action || 'check'
      });

      return JSON.stringify({
        success: true,
        message: response.message,
        previousState: response.previousState,
        newState: response.newState,
        element: response.element
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  }

}

// Export for use in sidepanel
window.EvidenceTools = EvidenceTools;
