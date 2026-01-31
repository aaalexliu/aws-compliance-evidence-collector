// Popup functionality for Firefox Extension
document.addEventListener('DOMContentLoaded', function() {
  
  // Open Sidebar
  document.getElementById('openSidebar').addEventListener('click', async () => {
    // Firefox opens sidebar differently
    await browser.sidebarAction.open();
    window.close();
  });
  
  // Open Landing Page
  document.getElementById('openLanding').addEventListener('click', () => {
    browser.tabs.create({
      url: browser.runtime.getURL('ui/landing.html')
    });
    window.close();
  });
  
  // Quick Screenshot
  document.getElementById('takeQuickScreenshot').addEventListener('click', async () => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      // Capture screenshot
      const screenshot = await browser.tabs.captureVisibleTab(null, { format: 'png' });
      
      // Download screenshot
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshot-${timestamp}.png`;
      
      await browser.downloads.download({
        url: screenshot,
        filename: filename,
        saveAs: true
      });
      
      window.close();
    } catch (error) {
      console.error('Screenshot failed:', error);
      alert('Screenshot failed: ' + error.message);
    }
  });
});
