// Background script for handling extension lifecycle
browser.runtime.onInstalled.addListener(() => {
  console.log('Evidence Collector extension installed');
});

// Open side panel when extension icon is clicked
browser.action.onClicked.addListener((tab) => {
  browser.sidePanel.open({ windowId: tab.windowId });
});

// Handle messages from content script or side panel
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'takeScreenshot') {
    browser.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl });
    });
    return true; // Keep message channel open for async response
  }
});
