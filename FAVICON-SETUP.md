# Favicon Setup Guide

This guide explains how to generate the complete favicon set for the Garden app from your source image.

## What's Included

The favicon set includes icons for:
- **Web browsers**: 16x16, 32x32, and .ico formats
- **Android devices**: 192x192 and 512x512 (standard and maskable)
- **Apple devices**: 180x180 apple-touch-icon
- **PWA support**: Icons configured in `manifest.json`

## Setup Instructions

### Step 1: Prepare Your Source Image
1. Place your favicon image (the green plant icon) in the project root
2. Name it: `favicon-source.png`
3. Image should be at least 512x512 pixels for best quality

### Step 2: Generate Favicons
Run the favicon generation script:

```bash
bash scripts/generate-favicons.sh
```

This will create all necessary favicon files in the `public/` directory.

### Step 3: Verify Installation
Check that the following files exist in `public/`:
- `favicon.ico` - Browser tab icon
- `favicon-16x16.png` - Small favicon
- `favicon-32x32.png` - Standard favicon
- `apple-touch-icon.png` - iOS home screen icon
- `icon-192x192.png` - Android home screen
- `icon-192x192-maskable.png` - Android adaptive icon
- `icon-512x512.png` - Android splash screen
- `icon-512x512-maskable.png` - Android adaptive icon

## File Locations

The following files have been configured to support favicons:
- `index.html` - HTML head includes favicon meta tags
- `public/manifest.json` - PWA manifest with icon declarations
- Files in `public/` - All generated favicon images

## Testing

### Web Browser
- Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
- Reload page - favicon should appear on browser tab

### Android Device
- Add the app to home screen (Chrome menu → "Add to Home screen")
- Icons will use the 192x192 and 512x512 variants

### Apple Device (iOS)
- Add to Home Screen (Safari → Share → Add to Home Screen)
- Uses the apple-touch-icon.png (180x180)

## Notes

- The maskable icons are designed for Android's adaptive icon system
- The favicon will automatically update after clearing browser cache
- No additional configuration is needed - setup is complete
- The manifest.json is already configured for PWA support

## Requirements

- ImageMagick (`convert` command must be available)
- Bash shell
- Source favicon image (favicon-source.png)
