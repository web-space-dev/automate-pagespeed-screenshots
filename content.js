// Content script for PageSpeed Insights Screenshot Extension
// Runs on PageSpeed Insights pages to help with element detection

console.log("PageSpeed Insights Screenshot Extension loaded");

// Wait for the page to be fully loaded and results to appear
function waitForResults() {
  const checkInterval = 1000; // Check every second
  const maxWaitTime = 30000; // Wait up to 30 seconds
  let elapsed = 0;

  const interval = setInterval(() => {
    const performanceScore = document.querySelector(
      '.lh-header-container, [data-testid="lh-gauge__percentage"], .lh-gauge__percentage, [data-testid="lh-gauge"], .lh-gauge'
    );

    if (performanceScore) {
      console.log("PageSpeed results detected");
      clearInterval(interval);

      // Add a visual indicator that the extension is ready
      addReadyIndicator();
    } else if (elapsed >= maxWaitTime) {
      console.log("Timeout waiting for PageSpeed results");
      clearInterval(interval);
    }

    elapsed += checkInterval;
  }, checkInterval);
}

// Add a small visual indicator that the extension is ready
function addReadyIndicator() {
  // Check if indicator already exists
  if (document.getElementById("pagespeed-extension-ready")) {
    return;
  }

  const indicator = document.createElement("div");
  indicator.id = "pagespeed-extension-ready";
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    background: #4CAF50;
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-family: Arial, sans-serif;
    z-index: 9999;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: opacity 0.3s ease;
  `;
  indicator.textContent = "📸 Extension Ready";

  document.body.appendChild(indicator);

  // Fade out after 3 seconds
  setTimeout(() => {
    indicator.style.opacity = "0";
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  }, 3000);
}

// Helper function to highlight the target element temporarily
function highlightTargetElement() {
  const selectors = [
    '[data-testid="lh-gauge__percentage"]',
    ".lh-gauge__percentage",
    '[data-testid="lh-gauge"]',
    ".lh-gauge",
    '[aria-label*="Performance"]',
    ".lh-score",
  ];

  let element = null;
  for (const selector of selectors) {
    element = document.querySelector(selector);
    if (element) break;
  }

  if (element) {
    const originalStyle = element.style.cssText;
    element.style.cssText += `
      outline: 3px solid #ff4444 !important;
      outline-offset: 2px !important;
      transition: outline 0.3s ease !important;
    `;

    setTimeout(() => {
      element.style.cssText = originalStyle;
    }, 2000);
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "highlightElement") {
    highlightTargetElement();
    sendResponse({ success: true });
  }
});

// Start waiting for results when the script loads
waitForResults();

// Also check if results are already loaded
if (document.readyState === "complete") {
  setTimeout(waitForResults, 1000);
}
