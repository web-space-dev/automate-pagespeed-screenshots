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
    // Capture both mobile and desktop screenshots
    await captureBothScreenshots(tab);
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
    console.log("🔍 Searching for performance score elements...");

    // Look for active tab panels first
    const activeTabPanels = document.querySelectorAll(
      '[role="tabpanel"][data-tab-panel-active="true"]'
    );
    console.log("Active tab panels found:", activeTabPanels.length);

    // Log which tab is currently active
    const activeDesktopTab = document.querySelector(
      '[aria-labelledby*="desktop"], [id*="desktop"][aria-selected="true"], button[aria-selected="true"][aria-label*="Desktop"]'
    );
    const activeMobileTab = document.querySelector(
      '[aria-labelledby*="mobile"], [id*="mobile"][aria-selected="true"], button[aria-selected="true"][aria-label*="Mobile"]'
    );

    console.log("Active tabs detected:", {
      desktop: !!activeDesktopTab,
      mobile: !!activeMobileTab,
      desktopTabInfo: activeDesktopTab
        ? {
            id: activeDesktopTab.id,
            ariaLabel: activeDesktopTab.getAttribute("aria-label"),
            ariaSelected: activeDesktopTab.getAttribute("aria-selected"),
          }
        : null,
      mobileTabInfo: activeMobileTab
        ? {
            id: activeMobileTab.id,
            ariaLabel: activeMobileTab.getAttribute("aria-label"),
            ariaSelected: activeMobileTab.getAttribute("aria-selected"),
          }
        : null,
    });

    // Look for scores within active tab panels - target the full scores header
    let scoresElement = null;
    for (const panel of activeTabPanels) {
      const scores = panel.querySelector(
        ".lh-scores-header, " +
          'div[class*="lh-scores-header"], ' +
          ".lh-scores-container, " +
          'div[class*="lh-scores-container"], ' +
          'div[data-testid="scores-container"]'
      );

      if (scores) {
        scoresElement = scores;
        console.log("✅ Found scores in active tab panel:", {
          panelId: panel.getAttribute("aria-labelledby"),
          panelActive: panel.getAttribute("data-tab-panel-active"),
          scoresClass: scores.className,
        });
        break;
      }
    }

    // Fallback: try to find scores anywhere on the page
    if (!scoresElement) {
      console.log(
        "⚠️ No scores in active panels, trying fallback selectors..."
      );

      const mobileScores = document.querySelector(
        ".lh-scores-header, " +
          'div[class*="lh-scores-header"], ' +
          ".lh-scores-container, " +
          'div[class*="lh-scores-container"], ' +
          'div[data-testid="scores-container"]'
      );

      const desktopScores = document.querySelector(
        '.lh-scores-header:not([style*="display: none"]), ' +
          'div[class*="lh-scores-header"]:not([style*="display: none"]), ' +
          '.lh-scores-container:not([style*="display: none"]), ' +
          'div[class*="lh-scores-container"]:not([style*="display: none"]), ' +
          'div[data-testid="scores-container"]:not([style*="display: none"])'
      );

      scoresElement = desktopScores || mobileScores;
      console.log("Fallback search results:", {
        mobileScores: !!mobileScores,
        desktopScores: !!desktopScores,
        selected: scoresElement ? scoresElement.className : "none",
      });
    }

    // Try to find all gauge elements - these represent all the scores (Performance, Accessibility, Best Practices, SEO, PWA)
    const gauges = document.querySelectorAll(
      ".lh-scores-header .lh-gauge, " +
        '.lh-scores-header div[class*="lh-gauge"], ' +
        'div[class*="lh-gauge"], ' +
        ".lh-gauge, " +
        'div[data-testid*="gauge"], ' +
        'div[class*="gauge"], ' +
        'svg[class*="gauge"], ' +
        'circle[class*="gauge"]'
    );

    console.log("Gauge elements found:", gauges.length);

    if (scoresElement) {
      // Use the scores header directly - it should contain all the gauges
      let gaugeContainer = scoresElement;

      // If we found the lh-scores-header specifically, use it directly
      if (
        scoresElement.classList.contains("lh-scores-header") ||
        scoresElement.className.includes("lh-scores-header")
      ) {
        gaugeContainer = scoresElement;
        console.log("✅ Using lh-scores-header directly for all scores");
      } else {
        // Look for the lh-scores-header within the found element
        const scoresHeader = scoresElement.querySelector(
          '.lh-scores-header, div[class*="lh-scores-header"]'
        );
        if (scoresHeader) {
          gaugeContainer = scoresHeader;
          console.log("✅ Found lh-scores-header within container");
        }
      }

      const rect = gaugeContainer.getBoundingClientRect();
      console.log("Final gauge container rect:", rect);

      // Make sure we have a valid rectangle
      if (rect.width > 0 && rect.height > 0) {
        // Add some minimal padding around the gauges
        const padding = 10;
        const adjustedRect = {
          x: Math.max(0, rect.x - padding),
          y: Math.max(0, rect.y - padding),
          width: Math.min(window.innerWidth, rect.width + padding * 2),
          height: Math.min(window.innerHeight, rect.height + padding * 2),
        };

        // Determine device type from active tab panel
        let deviceType = "unknown";
        const parentPanel = gaugeContainer.closest('[role="tabpanel"]');
        if (parentPanel) {
          const panelId = parentPanel.getAttribute("aria-labelledby") || "";
          deviceType = panelId.toLowerCase().includes("desktop")
            ? "desktop"
            : panelId.toLowerCase().includes("mobile")
            ? "mobile"
            : "unknown";
        }

        console.log("✅ All scores found!", {
          element: gaugeContainer.tagName + "." + gaugeContainer.className,
          rect: adjustedRect,
          gauges: gauges.length,
          deviceType: deviceType,
          parentPanel: parentPanel
            ? parentPanel.getAttribute("aria-labelledby")
            : "none",
        });

        return {
          found: true,
          rect: adjustedRect,
          element: gaugeContainer.tagName + "." + gaugeContainer.className,
          gaugeCount: gauges.length,
          deviceType: deviceType,
        };
      }
    }

    console.log("❌ All scores not found or not visible");
    return { found: false };
  };

  return checkForElement();
}

// Function to crop the screenshot to the performance score element
function cropScreenshotInPage(dataUrl, elementInfo) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const rect = elementInfo.rect;
      const dpr = window.devicePixelRatio || 1;

      // Set canvas size to the cropped area (accounting for device pixel ratio)
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // Enable image smoothing for better quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Draw the cropped portion of the image
      ctx.drawImage(
        img,
        rect.x * dpr, // Source x
        rect.y * dpr, // Source y
        rect.width * dpr, // Source width
        rect.height * dpr, // Source height
        0, // Destination x
        0, // Destination y
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

// Function to wait for element to be visible with retry logic
function waitForElementVisible(deviceType, maxWaitTime = 8000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkVisibility = () => {
      console.log(`🔍 Checking visibility for ${deviceType}...`);

      // Look for active tab panels specifically
      const activeTabPanels = document.querySelectorAll(
        '[role="tabpanel"][data-tab-panel-active="true"]'
      );
      console.log(`Found ${activeTabPanels.length} active tab panels`);

      let targetElement = null;

      // Check each active tab panel for the device type we want
      for (const panel of activeTabPanels) {
        const panelId = panel.getAttribute("aria-labelledby") || "";
        const isDesktopPanel = panelId.toLowerCase().includes("desktop");
        const isMobilePanel = panelId.toLowerCase().includes("mobile");

        console.log(
          `Panel ${panelId}: desktop=${isDesktopPanel}, mobile=${isMobilePanel}`
        );

        if (
          (deviceType === "desktop" && isDesktopPanel) ||
          (deviceType === "mobile" && isMobilePanel)
        ) {
          // Look for all scores within this panel (not just performance)
          const scores = panel.querySelector(
            ".lh-scores-header, " +
              'div[class*="lh-scores-header"], ' +
              ".lh-scores-container, " +
              'div[class*="lh-scores-container"], ' +
              'div[data-testid="scores-container"]'
          );

          if (scores) {
            targetElement = scores;
            console.log(`✅ Found ${deviceType} scores in panel ${panelId}`);
            break;
          }
        }
      }

      // Fallback to original logic if no specific panel found
      if (!targetElement) {
        console.log(
          `⚠️ No specific ${deviceType} panel found, using fallback...`
        );

        const mobileScores = document.querySelector(
          ".lh-scores-header, " +
            'div[class*="lh-scores-header"], ' +
            ".lh-scores-container, " +
            'div[class*="lh-scores-container"], ' +
            'div[data-testid="scores-container"]'
        );

        const desktopScores = document.querySelector(
          '.lh-scores-header:not([style*="display: none"]), ' +
            'div[class*="lh-scores-header"]:not([style*="display: none"]), ' +
            '.lh-scores-container:not([style*="display: none"]), ' +
            'div[class*="lh-scores-container"]:not([style*="display: none"]), ' +
            'div[data-testid="scores-container"]:not([style*="display: none"])'
        );

        targetElement =
          deviceType === "mobile"
            ? mobileScores || desktopScores
            : desktopScores || mobileScores;
      }

      if (targetElement) {
        // Check if element is actually visible (not just present in DOM)
        const rect = targetElement.getBoundingClientRect();
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          window.getComputedStyle(targetElement).display !== "none" &&
          window.getComputedStyle(targetElement).visibility !== "hidden";

        if (isVisible) {
          console.log(`✅ ${deviceType} element is visible:`, {
            element: targetElement.tagName + "." + targetElement.className,
            rect: rect,
            visible: isVisible,
          });
          resolve(true);
          return;
        }
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > maxWaitTime) {
        console.warn(
          `⏰ Timeout waiting for ${deviceType} element to be visible after ${elapsed}ms`
        );
        resolve(false); // Don't reject, just resolve as false
        return;
      }

      // Continue checking
      setTimeout(checkVisibility, 300);
    };

    checkVisibility();
  });
}

// Function to capture both mobile and desktop screenshots
async function captureBothScreenshots(tab) {
  const deviceTypes = ["mobile", "desktop"]; // Mobile first, then desktop
  const results = [];

  console.log("🎬 Starting dual screenshot capture...");

  for (let i = 0; i < deviceTypes.length; i++) {
    const deviceType = deviceTypes[i];
    console.log(
      `📸 Capturing ${deviceType} screenshot (${i + 1}/${
        deviceTypes.length
      })...`
    );

    try {
      // Switch to the appropriate tab/view
      console.log(`🔄 Switching to ${deviceType} view...`);
      const switchResult = await safeExecuteScript(tab.id, switchToDeviceView, [
        deviceType,
      ]);
      console.log(`Switch to ${deviceType} result:`, switchResult);

      // Wait for tab switch to complete
      const baseWaitTime = deviceType === "desktop" ? 2500 : 1500;
      console.log(
        `⏳ Initial wait ${baseWaitTime}ms for ${deviceType} view to load...`
      );
      await new Promise((resolve) => setTimeout(resolve, baseWaitTime));

      // Wait for the element to be visible with retry logic
      console.log(`👀 Waiting for ${deviceType} element to be visible...`);
      const elementVisible = await safeExecuteScript(
        tab.id,
        waitForElementVisible,
        [deviceType, 10000]
      );
      console.log(
        `Element visibility check result for ${deviceType}:`,
        elementVisible
      );

      if (!elementVisible || !elementVisible[0] || !elementVisible[0].result) {
        console.warn(
          `⚠️ ${deviceType} element not visible, but continuing anyway...`
        );
      }

      // Additional wait for desktop to ensure content is fully rendered
      if (deviceType === "desktop") {
        console.log("🖥️ Extra wait for desktop content rendering...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Get element info for this device type
      console.log(`🔍 Getting ${deviceType} element info...`);
      const elementResults = await safeExecuteScript(
        tab.id,
        getPerformanceScoreElement
      );

      if (
        !elementResults ||
        !elementResults[0] ||
        !elementResults[0].result ||
        !elementResults[0].result.found
      ) {
        console.warn(`⚠️ ${deviceType} scores not found, skipping...`);
        continue;
      }

      const elementInfo = elementResults[0].result;
      console.log(`🎯 ${deviceType} element info:`, elementInfo);

      // Capture screenshot with retry
      console.log(`📷 Capturing ${deviceType} tab screenshot...`);
      let dataUrl;
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "png",
          quality: 100,
        });

        // Check if screenshot is valid (not blank)
        if (!dataUrl || dataUrl.length < 1000) {
          throw new Error(
            `Screenshot appears to be blank (${
              dataUrl ? dataUrl.length : 0
            } bytes)`
          );
        }

        console.log(
          `📸 ${deviceType} screenshot captured: ${dataUrl.length} bytes`
        );
      } catch (captureError) {
        console.error(
          `❌ Failed to capture ${deviceType} screenshot:`,
          captureError
        );

        // Try one more time after a longer wait
        console.log(
          `🔄 Retrying ${deviceType} screenshot after additional wait...`
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));

        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "png",
          quality: 100,
        });

        if (!dataUrl || dataUrl.length < 1000) {
          throw new Error(`Screenshot retry also failed for ${deviceType}`);
        }

        console.log(
          `📸 ${deviceType} screenshot retry successful: ${dataUrl.length} bytes`
        );
      }

      // Crop screenshot
      console.log(`✂️ Cropping ${deviceType} screenshot...`);
      const cropResults = await safeExecuteScript(
        tab.id,
        cropScreenshotInPage,
        [dataUrl, elementInfo]
      );

      if (!cropResults || !cropResults[0] || !cropResults[0].result) {
        throw new Error(`Failed to crop ${deviceType} screenshot`);
      }

      const croppedDataUrl = cropResults[0].result;
      console.log(`✅ ${deviceType} screenshot cropped successfully`);

      // Generate filename
      const url = new URL(tab.url);
      let domain = url.searchParams.get("url");

      if (domain) {
        try {
          const domainUrl = new URL(domain);
          domain = domainUrl.hostname;
        } catch {
          domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        }
      } else {
        domain = "pagespeed-result";
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      const filename = `pagespeed-score-${domain.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}-${deviceType}-${timestamp}.png`;

      // Download screenshot
      chrome.downloads.download({
        url: croppedDataUrl,
        filename: filename,
        saveAs: false,
      });

      results.push({ deviceType, filename });
      console.log(`✅ ${deviceType} screenshot saved: ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to capture ${deviceType} screenshot:`, error);
      results.push({ deviceType, error: error.message });
    }
  }

  // Show summary notification
  const successCount = results.filter((r) => !r.error).length;

  let message;
  if (successCount === 2) {
    message = `📱💻 Both desktop and mobile screenshots captured!`;
  } else if (successCount === 1) {
    const successful = results.find((r) => !r.error);
    message = `📸 ${
      successful.deviceType.charAt(0).toUpperCase() +
      successful.deviceType.slice(1)
    } screenshot captured. ${2 - successCount} failed.`;
  } else {
    message = `❌ No screenshots captured. Check console for details.`;
  }

  await safeExecuteScript(tab.id, showNotification, [message]);
}

// Function to switch between mobile and desktop views
function switchToDeviceView(targetDeviceType) {
  console.log(`🔄 Attempting to switch to ${targetDeviceType} view...`);

  // Look for tab buttons specifically
  const allButtons = document.querySelectorAll(
    'button, [role="tab"], [role="button"]'
  );
  console.log(`Found ${allButtons.length} potential buttons/tabs`);

  let targetButton = null;

  // First, try to find buttons with specific IDs that match the pattern
  const specificButton = document.querySelector(
    `button[id*="${targetDeviceType}"], [id*="${targetDeviceType}_tab"]`
  );
  if (specificButton) {
    targetButton = specificButton;
    console.log(
      `✅ Found specific ${targetDeviceType} button by ID:`,
      specificButton.id
    );
  }

  // If not found, search through all buttons
  if (!targetButton) {
    for (const button of allButtons) {
      const text = (button.textContent || "").toLowerCase().trim();
      const ariaLabel = (button.getAttribute("aria-label") || "").toLowerCase();
      const className = (button.className || "").toLowerCase();
      const id = (button.id || "").toLowerCase();
      const dataAttrs = Array.from(button.attributes)
        .filter((attr) => attr.name.startsWith("data-"))
        .map((attr) => `${attr.name}="${attr.value}"`)
        .join(" ");

      const allText = `${text} ${ariaLabel} ${className} ${id} ${dataAttrs}`;

      console.log(
        `Checking button: "${text}" | ID: "${id}" | Class: "${className}" | Aria: "${ariaLabel}"`
      );

      if (
        targetDeviceType === "mobile" &&
        (text === "mobile" ||
          ariaLabel.includes("mobile") ||
          id.includes("mobile") ||
          className.includes("mobile") ||
          button.querySelector('svg[data-testid*="mobile"]') ||
          button.querySelector('[class*="mobile"]'))
      ) {
        targetButton = button;
        console.log(`✅ Found mobile button: "${text}" (${id})`);
        break;
      } else if (
        targetDeviceType === "desktop" &&
        (text === "desktop" ||
          ariaLabel.includes("desktop") ||
          id.includes("desktop") ||
          className.includes("desktop") ||
          button.querySelector('svg[data-testid*="desktop"]') ||
          button.querySelector('[class*="desktop"]'))
      ) {
        targetButton = button;
        console.log(`✅ Found desktop button: "${text}" (${id})`);
        break;
      }
    }
  }

  if (targetButton) {
    console.log(`🎯 Clicking ${targetDeviceType} button:`, {
      text: targetButton.textContent,
      id: targetButton.id,
      className: targetButton.className,
      ariaLabel: targetButton.getAttribute("aria-label"),
    });

    // Check current state before clicking
    const wasSelected = targetButton.getAttribute("aria-selected") === "true";
    console.log(
      `Button was ${wasSelected ? "already" : "not"} selected before click`
    );

    targetButton.click();

    // Check state after clicking
    setTimeout(() => {
      const isNowSelected =
        targetButton.getAttribute("aria-selected") === "true";
      console.log(
        `Button is ${isNowSelected ? "now" : "still not"} selected after click`
      );

      // Check if the corresponding tab panel is now active
      const correspondingPanel = document.querySelector(
        `[aria-labelledby="${targetButton.id}"]`
      );
      if (correspondingPanel) {
        const panelActive =
          correspondingPanel.getAttribute("data-tab-panel-active") === "true";
        console.log(
          `Corresponding panel is ${
            panelActive ? "now active" : "still inactive"
          }`
        );
      }
    }, 100);

    return true;
  } else {
    console.log(`❌ No ${targetDeviceType} button found. Available buttons:`);
    allButtons.forEach((btn, i) => {
      console.log(
        `  ${i}: "${btn.textContent}" | ID: "${btn.id}" | Class: "${btn.className}"`
      );
    });
    return false;
  }
}
