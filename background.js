// Background script for PageSpeed Insights Screenshot Extension
// Handles the browser action click and coordinates screenshot capture

// Check if required APIs are available
if (!chrome.scripting) {
  console.error(
    "❌ chrome.scripting API not available. Check manifest permissions."
  );
}

if (!chrome.downloads) {
  console.error(
    "❌ chrome.downloads API not available. Check manifest permissions."
  );
}

console.log("🚀 PageSpeed Screenshot Extension background script loaded");

chrome.action.onClicked.addListener(async (tab) => {
  console.log("🔵 Extension icon clicked!", { url: tab.url, tabId: tab.id });

  // Check if scripting API is available
  if (!chrome.scripting) {
    console.error(
      "❌ chrome.scripting API not available. Missing 'scripting' permission in manifest.json"
    );
    return;
  }

  // Only activate on PageSpeed Insights pages
  if (!tab.url || !tab.url.includes("pagespeed.web.dev/")) {
    console.warn(
      "❌ Extension only works on PageSpeed Insights result pages. Current URL:",
      tab.url
    );

    // Show notification on any page when clicked
    try {
      await safeExecuteScript(tab.id, showNotification, [
        "This extension only works on PageSpeed Insights result pages. Go to https://pagespeed.web.dev/",
      ]);
    } catch (error) {
      console.error("Could not show notification:", error);
    }
    return;
  }

  console.log("✅ URL check passed, proceeding with screenshot capture...");

  try {
    console.log("🔍 Attempting to get performance score element...");

    // First, inject the content script if needed and get element info
    const results = await safeExecuteScript(tab.id, getPerformanceScoreElement);

    console.log("📊 Script execution results:", results);

    if (!results || !results[0] || !results[0].result) {
      console.error("❌ Failed to get element information");
      return;
    }

    const elementInfo = results[0].result;
    console.log("🎯 Element info received:", elementInfo);

    if (!elementInfo.found) {
      console.warn("⚠️ Performance score element not found on page");
      // Try to show a notification to the user
      await safeExecuteScript(tab.id, showNotification, [
        "Performance score element not found. Please wait for the page to fully load.",
      ]);
      return;
    }

    console.log("📸 Capturing visible tab...");

    // Capture the visible tab with higher quality
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
      quality: 100, // Maximum quality for JPEG (though PNG ignores this)
    });

    console.log("✅ Screenshot captured, processing...");

    // Process the screenshot by cropping to the element (run in page context)
    const cropResults = await safeExecuteScript(tab.id, cropScreenshotInPage, [
      dataUrl,
      elementInfo,
    ]);

    if (!cropResults || !cropResults[0] || !cropResults[0].result) {
      throw new Error("Failed to crop screenshot");
    }

    const croppedDataUrl = cropResults[0].result;

    console.log("✂️ Screenshot cropped successfully");

    // Generate filename with timestamp and domain
    const url = new URL(tab.url);
    let domain = url.searchParams.get("url");

    if (domain) {
      // Clean up the domain from the URL parameter
      try {
        const domainUrl = new URL(domain);
        domain = domainUrl.hostname;
      } catch {
        // If it's not a full URL, use as-is but clean it
        domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      }
    } else {
      domain = "pagespeed-result";
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);

    // Using PNG format for lossless quality
    const filename = `pagespeed-score-${domain.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    )}-${timestamp}.png`;

    console.log("💾 Downloading file:", filename);

    // Download the cropped screenshot
    chrome.downloads.download({
      url: croppedDataUrl,
      filename: filename,
      saveAs: false,
    });

    // Show success notification
    await safeExecuteScript(tab.id, showNotification, [
      `Screenshot saved as ${filename}`,
    ]);
  } catch (error) {
    console.error("❌ Error capturing screenshot:", error);
    console.error("📍 Error stack:", error.stack);

    try {
      await safeExecuteScript(tab.id, showNotification, [
        `Error capturing screenshot: ${error.message}. Check browser console for details.`,
      ]);
    } catch (notificationError) {
      console.error("Could not show error notification:", notificationError);
    }
  }
});

// Helper function for safer script execution
async function safeExecuteScript(tabId, func, args = []) {
  try {
    if (!chrome.scripting) {
      throw new Error("chrome.scripting API not available");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: func,
      args: args,
    });

    return results;
  } catch (error) {
    console.error("❌ Script execution failed:", error);

    // Try to log more specific error information
    if (error.message.includes("Cannot access")) {
      console.error("📍 Permission error: Extension cannot access this page");
    } else if (error.message.includes("chrome.scripting")) {
      console.error("📍 API error: scripting permission missing from manifest");
    }

    throw error;
  }
}

// Function to be injected into the page to find the performance score element
function getPerformanceScoreElement() {
  // Wait for the results to be loaded
  const checkForElement = () => {
    // Try multiple selectors for the performance score
    const selectors = [
      ".lh-scores-header", // Target element as requested
      '[data-testid="lh-gauge__percentage"]', // Main performance score percentage
      ".lh-gauge__percentage", // Alternative class name
      '[data-testid="lh-gauge"]', // Entire gauge container
      ".lh-gauge", // Alternative gauge container
      '[aria-label*="Performance"]', // ARIA label approach
      ".lh-score", // Score container
    ];

    let element = null;
    let selector = null;

    for (const sel of selectors) {
      element = document.querySelector(sel);
      if (element) {
        selector = sel;
        break;
      }
    }

    if (!element) {
      return { found: false };
    }

    // Get the bounding rectangle
    let rect = element.getBoundingClientRect();

    // If we found the scores header container, calculate tight bounds around just the gauges
    if (selector === ".lh-scores-header") {
      const gauges = element.querySelectorAll(".lh-gauge__wrapper");
      if (gauges.length > 0) {
        // Find the leftmost and rightmost gauge positions
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        gauges.forEach((gauge) => {
          const gaugeRect = gauge.getBoundingClientRect();
          minX = Math.min(minX, gaugeRect.left);
          maxX = Math.max(maxX, gaugeRect.right);
          minY = Math.min(minY, gaugeRect.top);
          maxY = Math.max(maxY, gaugeRect.bottom);
        });

        // Create a tight bounding box around all gauges
        rect = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          left: minX,
          top: minY,
          right: maxX,
          bottom: maxY,
        };
      }
    }

    // Add minimal padding around the element
    const verticalPadding = 10;
    const horizontalPadding = 10;

    return {
      found: true,
      selector: selector,
      rect: {
        x: Math.max(0, rect.x - horizontalPadding),
        y: Math.max(0, rect.y - verticalPadding),
        width: rect.width + horizontalPadding * 2,
        height: rect.height + verticalPadding * 2,
      },
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  };

  return checkForElement();
}

// Function to crop the screenshot to the target element (runs in page context)
function cropScreenshotInPage(dataUrl, elementInfo) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const dpr = elementInfo.devicePixelRatio;
      const rect = elementInfo.rect;

      // No scaling - use native resolution to preserve SVG quality
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // Disable any smoothing to preserve exact pixels
      ctx.imageSmoothingEnabled = false;

      // Draw the cropped portion at native resolution (1:1 pixel mapping)
      ctx.drawImage(
        img,
        rect.x * dpr, // Source X
        rect.y * dpr, // Source Y
        rect.width * dpr, // Source width
        rect.height * dpr, // Source height
        0, // Destination X
        0, // Destination Y
        rect.width * dpr, // Destination width (same as source)
        rect.height * dpr // Destination height (same as source)
      );

      // Use PNG for lossless quality
      const finalDataUrl = canvas.toDataURL("image/png");

      console.log("Canvas dimensions:", canvas.width, "x", canvas.height);
      console.log("Original rect:", rect);
      console.log("DPR:", dpr, "- No scaling applied");

      resolve(finalDataUrl);
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = dataUrl;
  });
}

// Function to show notifications to the user
function showNotification(message) {
  // Create a temporary notification element
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10000;
    font-family: Arial, sans-serif;
    font-size: 14px;
    max-width: 300px;
    word-wrap: break-word;
  `;

  if (message.includes("Error") || message.includes("not found")) {
    notification.style.background = "#f44336";
  }

  notification.textContent = message;
  document.body.appendChild(notification);

  // Remove after 4 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 4000);
}
