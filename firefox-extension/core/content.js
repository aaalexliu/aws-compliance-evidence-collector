// Content script - runs on every page for DOM automation (Firefox version)
// Prevent duplicate declarations
if (typeof DOMAutomation === 'undefined') {
  
class DOMAutomation {
  
  // Find elements by text content (case insensitive)
  findByText(text, tagNames = ['button', 'a', 'span', 'div', 'li']) {
    const elements = [];
    for (const tag of tagNames) {
      const found = Array.from(document.querySelectorAll(tag)).filter(el => 
        el.textContent.toLowerCase().includes(text.toLowerCase()) && 
        el.offsetParent !== null // visible elements only
      );
      elements.push(...found);
    }
    return elements;
  }

  // Find elements by common attributes
  findByAttribute(text) {
    const selectors = [
      `[aria-label*="${text}" i]`,
      `[title*="${text}" i]`,
      `[placeholder*="${text}" i]`,
      `[data-testid*="${text}" i]`,
      `[class*="${text}" i]`,
      `[id*="${text}" i]`
    ];
    
    const elements = [];
    for (const selector of selectors) {
      try {
        elements.push(...document.querySelectorAll(selector));
      } catch (e) {} // Ignore invalid selectors
    }
    return elements;
  }

  // Smart element finder combining multiple strategies
  findElement(description) {
    const words = description.toLowerCase().split(' ');
    let candidates = [];

    // Strategy 1: Find by text content
    for (const word of words) {
      candidates.push(...this.findByText(word));
    }

    // Strategy 2: Find by attributes
    for (const word of words) {
      candidates.push(...this.findByAttribute(word));
    }

    // Strategy 3: Common UI patterns
    if (description.includes('profile') || description.includes('account')) {
      candidates.push(...document.querySelectorAll('[class*="profile"], [class*="account"], [class*="user"], [aria-label*="profile" i], [aria-label*="account" i]'));
    }
    
    if (description.includes('settings')) {
      candidates.push(...document.querySelectorAll('[class*="settings"], [aria-label*="settings" i], [href*="settings"]'));
    }

    if (description.includes('menu') || description.includes('dropdown')) {
      candidates.push(...document.querySelectorAll('[class*="menu"], [class*="dropdown"], [role="menu"], [aria-haspopup="true"]'));
    }

    // Remove duplicates and score by relevance
    const unique = [...new Set(candidates)];
    return this.scoreElements(unique, description);
  }

  // Score elements by how well they match the description
  scoreElements(elements, description) {
    const words = description.toLowerCase().split(' ');
    const fullDescription = description.toLowerCase().trim();
    
    return elements.map(el => {
      let score = 0;
      
      // Get both full text and direct text (excluding children)
      const fullText = (el.textContent || '').trim().toLowerCase();
      const directText = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .join(' ')
        .toLowerCase();
      
      const attrs = (el.outerHTML || '').toLowerCase();
      
      // HIGHEST priority: Exact match on direct text (button's own text)
      if (directText === fullDescription) {
        score += 150; // Highest score for exact direct text match
      }
      
      // Very high priority: Exact match on full text
      if (fullText === fullDescription) {
        score += 100;
      }
      
      // High priority: Direct text starts with description
      if (directText.startsWith(fullDescription)) {
        score += 70;
      }
      
      // High priority: Full text starts with description
      if (fullText.startsWith(fullDescription)) {
        score += 50;
      }
      
      // Medium priority: Description is a complete word in text
      const textWords = fullText.split(/\s+/);
      if (textWords.includes(fullDescription)) {
        score += 30;
      }
      
      // Lower priority: Partial word matches
      for (const word of words) {
        if (fullText.includes(word)) score += 10;
        if (attrs.includes(word)) score += 5;
      }
      
      // Bonus for clickable elements
      if (el.tagName === 'BUTTON' || el.tagName === 'A') score += 5;
      if (el.onclick || el.getAttribute('onclick')) score += 3;
      
      // Penalty for hidden elements
      if (el.offsetParent === null) score -= 20;
      
      return { element: el, score, text: fullText.substring(0, 50) };
    }).sort((a, b) => b.score - a.score);
  }

  // Wait for element to appear (useful for dynamic content)
  async waitForElement(description, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const elements = this.findElement(description);
      if (elements.length > 0) {
        return elements[0].element;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Element "${description}" not found within ${timeout}ms`);
  }

  // Specialized checkbox finder
  findCheckbox(description) {
    const words = description.toLowerCase().split(' ');
    let candidates = [];

    // Find all checkbox inputs
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    for (const checkbox of checkboxes) {
      if (!checkbox.offsetParent) continue; // Skip hidden elements
      
      let score = 0;
      let text = '';
      
      // Get text from various sources
      const label = checkbox.closest('label') || document.querySelector(`label[for="${checkbox.id}"]`);
      if (label) {
        text = label.textContent.trim();
      } else {
        // Look for nearby text
        const parent = checkbox.parentElement;
        text = parent ? parent.textContent.trim() : '';
        
        // Try siblings
        if (!text && checkbox.nextSibling) {
          text = checkbox.nextSibling.textContent?.trim() || '';
        }
        if (!text && checkbox.previousSibling) {
          text = checkbox.previousSibling.textContent?.trim() || '';
        }
      }
      
      // Score based on text match
      const lowerText = text.toLowerCase();
      for (const word of words) {
        if (lowerText.includes(word)) {
          score += word.length;
        }
      }
      
      // Bonus for exact matches
      if (lowerText.includes(description.toLowerCase())) {
        score += 10;
      }
      
      // Bonus for common checkbox patterns
      if (lowerText.includes('select all') && description.toLowerCase().includes('select all')) {
        score += 15;
      }
      
      if (score > 0) {
        candidates.push({
          element: checkbox,
          text: text,
          score: score
        });
      }
    }
    
    // Sort by score (highest first)
    return candidates.sort((a, b) => b.score - a.score);
  }
}

const automation = new DOMAutomation();

// Listen for messages from popup - Firefox uses browser API
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === 'scrollPage') {
    window.scrollBy(0, request.amount || 500);
    sendResponse({ success: true });
  }
  
  if (request.action === 'getAllClickableElements') {
    try {
      const clickableElements = [];
      const selectors = 'button, a, input[type="button"], input[type="submit"], [role="button"], [onclick]';
      const elements = document.querySelectorAll(selectors);
      
      elements.forEach(el => {
        // Skip hidden or invisible elements
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return;
        }
        
        // Skip elements with no dimensions
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return;
        }
        
        const text = el.textContent?.trim() || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '';
        
        // Only include elements with meaningful text (at least 2 characters)
        if (text && text.length >= 2) {
          clickableElements.push({
            text: text.substring(0, 100).replace(/\s+/g, ' '), // Normalize whitespace, max 100 chars
            tag: el.tagName.toLowerCase(),
            type: el.type || 'button',
            visible: true
          });
        }
      });
      
      sendResponse({ 
        success: true, 
        elements: clickableElements.slice(0, 30) // Limit to 30 elements
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
  
  if (request.action === 'clickElement') {
    try {
      const elements = automation.findElement(request.description);
      
      if (elements.length === 0) {
        sendResponse({ 
          success: false, 
          error: `No element found matching "${request.description}"` 
        });
        return;
      }

      const bestMatch = elements[0];
      bestMatch.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Send response immediately
      sendResponse({ 
        success: true, 
        message: `Clicked: ${bestMatch.text}`,
        score: bestMatch.score
      });
      
      // Wait a moment for scroll, then click
      setTimeout(() => {
        bestMatch.element.click();
      }, 500);
      
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    
    return; // Response already sent
  }

  if (request.action === 'selectCheckbox') {
    try {
      // Find checkbox elements specifically
      const checkboxElements = automation.findCheckbox(request.description);
      
      if (checkboxElements.length === 0) {
        sendResponse({ 
          success: false, 
          error: `No checkbox found matching "${request.description}"` 
        });
        return;
      }

      const bestMatch = checkboxElements[0];
      const checkbox = bestMatch.element;
      const previousState = checkbox.checked;
      
      // Scroll into view
      checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Wait a moment for scroll, then perform action
      setTimeout(() => {
        let shouldClick = false;
        const action = request.checkboxAction || 'check';
        
        switch (action) {
          case 'check':
            shouldClick = !checkbox.checked;
            break;
          case 'uncheck':
            shouldClick = checkbox.checked;
            break;
          case 'toggle':
            shouldClick = true;
            break;
        }
        
        if (shouldClick) {
          checkbox.click();
        }
        
        const newState = checkbox.checked;
        const actionTaken = shouldClick ? (newState ? 'checked' : 'unchecked') : 'no change needed';
        
        sendResponse({ 
          success: true, 
          message: `Checkbox "${bestMatch.text}" ${actionTaken} (was ${previousState ? 'checked' : 'unchecked'}, now ${newState ? 'checked' : 'unchecked'})`,
          previousState: previousState,
          newState: newState,
          element: bestMatch.text,
          actionTaken: actionTaken
        });
      }, 500);
      
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    
    return true; // Keep message channel open for async response
  }

  if (request.action === 'showCheckboxes') {
    try {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      const results = [];
      
      for (const checkbox of checkboxes) {
        if (!checkbox.offsetParent) continue; // Skip hidden elements
        
        let text = '';
        
        // Get text from various sources
        const label = checkbox.closest('label') || document.querySelector(`label[for="${checkbox.id}"]`);
        if (label) {
          text = label.textContent.trim();
        } else {
          // Look for nearby text
          const parent = checkbox.parentElement;
          text = parent ? parent.textContent.trim() : '';
          
          // Try siblings
          if (!text && checkbox.nextSibling) {
            text = checkbox.nextSibling.textContent?.trim() || '';
          }
          if (!text && checkbox.previousSibling) {
            text = checkbox.previousSibling.textContent?.trim() || '';
          }
        }
        
        // Clean up text (remove extra whitespace, limit length)
        text = text.replace(/\s+/g, ' ').trim();
        if (text.length > 50) {
          text = text.substring(0, 47) + '...';
        }
        
        if (text) {
          results.push({
            text: text,
            checked: checkbox.checked,
            id: checkbox.id || 'no-id',
            type: 'checkbox'
          });
        }
      }
      
      sendResponse({ 
        success: true, 
        checkboxes: results
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  if (request.action === 'findElements') {
    try {
      const elements = automation.findElement(request.description);
      const results = elements.slice(0, 5).map(item => ({
        text: item.text,
        score: item.score,
        tagName: item.element.tagName,
        visible: item.element.offsetParent !== null
      }));
      
      sendResponse({ success: true, elements: results });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  if (request.action === 'searchElements') {
    try {
      const elements = automation.findElement(request.query);
      const results = elements.slice(0, 5).map(item => ({
        text: item.text,
        score: item.score,
        tagName: item.element.tagName,
        visible: item.element.offsetParent !== null,
        selector: item.element.tagName.toLowerCase() + (item.element.id ? `#${item.element.id}` : '') + (item.element.className ? `.${item.element.className.split(' ').join('.')}` : '')
      }));
      
      sendResponse({ success: true, elements: results });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'typeText') {
    try {
      // Find input field based on description
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      let targetInput = null;

      // Try to find input by common search terms
      const searchTerms = request.element.toLowerCase();
      
      for (const input of inputs) {
        const placeholder = (input.placeholder || '').toLowerCase();
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const type = (input.type || '').toLowerCase();
        const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
        
        // AWS Console search box detection
        if (id.includes('awsc-nav-search') || 
            ariaLabel.includes('search') && placeholder.includes('search') ||
            input.classList.contains('awsui-input-type-search')) {
          targetInput = input;
          break;
        }
        // Google-specific search box detection
        else if (name === 'q' || id === 'APjFqb' || ariaLabel.includes('search')) {
          targetInput = input;
          break;
        } else if (searchTerms.includes('search') && (
          placeholder.includes('search') || 
          name.includes('search') || 
          id.includes('search') ||
          type === 'search' ||
          ariaLabel.includes('search')
        )) {
          targetInput = input;
          break;
        } else if (searchTerms.includes('email') && (
          placeholder.includes('email') || 
          name.includes('email') || 
          id.includes('email') ||
          type === 'email'
        )) {
          targetInput = input;
          break;
        } else if (searchTerms.includes('password') && type === 'password') {
          targetInput = input;
          break;
        }
      }

      // If no specific match, try first visible input
      if (!targetInput) {
        targetInput = inputs.find(input => 
          input.offsetParent !== null && 
          !input.disabled && 
          !input.readOnly
        );
      }

      if (targetInput) {
        // Focus and type text
        targetInput.focus();
        targetInput.value = request.text;
        
        // Trigger input events
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Auto-press Enter for search boxes
        if (searchTerms.includes('search')) {
          // Send response BEFORE triggering navigation
          sendResponse({ 
            success: true, 
            message: `Typed "${request.text}" into ${request.element} and pressed Enter` 
          });
          
          // Delay navigation slightly to ensure response is sent
          setTimeout(() => {
            // Try multiple methods to trigger Enter
            const enterEvent = new KeyboardEvent('keydown', { 
              key: 'Enter', 
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true
            });
            targetInput.dispatchEvent(enterEvent);
            
            // Also try submitting the form if it exists
            const form = targetInput.closest('form');
            if (form) {
              form.submit();
            }
          }, 100);
          return; // Exit early, response already sent
        }
        
        sendResponse({ 
          success: true, 
          message: `Typed "${request.text}" into ${request.element}` 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: `Could not find input field: ${request.element}` 
        });
      }
    } catch (error) {
      sendResponse({ 
        success: false, 
        error: `Error typing text: ${error.message}` 
      });
    }
  } else if (request.action === 'scrollPage') {
    try {
      const direction = request.direction;
      const amount = request.amount || 'medium';
      
      let scrollAmount = 0;
      switch (amount) {
        case 'small': scrollAmount = 200; break;
        case 'medium': scrollAmount = 400; break;
        case 'large': scrollAmount = 800; break;
        case 'top': 
          window.scrollTo(0, 0);
          sendResponse({ success: true, message: 'Scrolled to top' });
          return true;
        case 'bottom':
          window.scrollTo(0, document.body.scrollHeight);
          sendResponse({ success: true, message: 'Scrolled to bottom' });
          return true;
      }
      
      if (direction === 'down') {
        window.scrollBy(0, scrollAmount);
      } else if (direction === 'up') {
        window.scrollBy(0, -scrollAmount);
      }
      
      sendResponse({ 
        success: true, 
        message: `Scrolled ${direction} (${amount})` 
      });
    } catch (error) {
      sendResponse({ 
        success: false, 
        error: `Error scrolling: ${error.message}` 
      });
    }
  }
});

} // End of DOMAutomation check
