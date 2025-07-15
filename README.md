# PageSpeed Insights Screenshot Extension

A Chrome extension that captures screenshots of PageSpeed Insights performance scores with automatic domain detection and dual device support.

## Features

- 🎯 **Smart Cropping**: Automatically detects and crops just the performance score gauges
- 📱💻 **Dual Device Support**: Captures both mobile and desktop screenshots automatically
- 🏷️ **Smart Filename**: Uses the tested domain name extracted from the page
- ⚡ **High Quality**: Supports device pixel ratio for crisp images
- 🔔 **User Feedback**: Shows notifications and status updates
- ⚙️ **Configurable**: Easy-to-adjust timeouts and cropping settings

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your Chrome toolbar

## Usage

1. Navigate to a PageSpeed Insights results page: `https://pagespeed.web.dev`
2. Wait for the performance results to fully load
3. Click the extension icon in the Chrome toolbar
4. The extension will automatically:
   - Capture a mobile screenshot
   - Switch to desktop view
   - Capture a desktop screenshot
   - Download both files with descriptive names

## Filename Format

Screenshots are saved with the format:

```
pagespeed-score-{domain}-{device}-{timestamp}.png
```

Examples:

- `pagespeed-score-example_com-mobile-2024-01-15T10-30-45.png`
- `pagespeed-score-example_com-desktop-2024-01-15T10-30-47.png`

## File Structure

```
automate-pagespeed-screenshots/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker
├── content.js            # Content script for page interaction
├── icons/               # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

## Technical Details

### How It Works

1. **Content Script**: Runs on PageSpeed Insights pages to detect when results are loaded
2. **Background Script**: Handles the browser action click and orchestrates the screenshot process
3. **Element Detection**: Uses multiple CSS selectors to find the performance score element
4. **Screenshot Capture**: Uses `chrome.tabs.captureVisibleTab()` to capture the full page
5. **Image Cropping**: Crops the full screenshot to only the target element using Canvas API
6. **Auto Download**: Automatically downloads the cropped image with a descriptive filename

### Permissions

- `activeTab` - Access to the current tab for screenshot capture
- `downloads` - Permission to download the screenshot file
- `https://pagespeed.web.dev/*` - Host permission for PageSpeed Insights

## Troubleshooting

### Extension Icon Not Visible

- Make sure you've enabled "Developer mode" in Chrome extensions
- Try refreshing the extensions page after loading

### Screenshot Not Working

- Ensure you're on a PageSpeed Insights results page (`https://pagespeed.web.dev/*`)
- Wait for the performance results to fully load before clicking the extension icon
- Check the browser console for any error messages

### Element Not Found

- The extension will show a notification if the performance score element isn't found
- Try waiting longer for the page to load completely
- Some PageSpeed Insights pages may have different layouts - the extension uses multiple selectors to handle this

## Development

To modify the extension:

1. Make changes to the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

### Adding New Target Elements

To add support for other elements, modify the `selectors` array in `background.js`:

```javascript
const selectors = [
  "your-new-selector",
  // ... existing selectors
];
```

## License

This project is provided as-is for educational and personal use.
