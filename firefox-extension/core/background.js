// Background script for Firefox - handles extension lifecycle
// Firefox uses background scripts instead of service workers

// Use browser API with Chrome compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.runtime.onInstalled.addListener(() => {
  console.log('Evidence Collector extension installed (Firefox)');
});

// Open sidebar when extension icon is clicked
// Firefox uses sidebar_action instead of sidePanel
browserAPI.browserAction.onClicked.addListener((tab) => {
  // Firefox sidebar is toggled, not opened per-window
  browserAPI.sidebarAction.open();
});

// Handle messages from content script or sidebar
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'takeScreenshot') {
    // Firefox uses browser.tabs.captureVisibleTab
    browserAPI.tabs.captureVisibleTab(null, { format: 'png' })
      .then((dataUrl) => {
        sendResponse({ screenshot: dataUrl });
      })
      .catch((error) => {
        console.error('Screenshot failed:', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'openSidebar') {
    browserAPI.sidebarAction.open();
    sendResponse({ success: true });
    return true;
  }
});

// Handle sidebar state
browserAPI.runtime.onConnect.addListener((port) => {
  console.log('Sidebar connected');
  
  port.onDisconnect.addListener(() => {
    console.log('Sidebar disconnected');
  });
});
