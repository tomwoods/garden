#!/bin/bash

# Favicon Generation Script
# Generates favicon set from source image for Garden app
# Usage: bash scripts/generate-favicons.sh

set -e

SOURCE_IMAGE="favicon-source.png"
PUBLIC_DIR="public"

if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Error: $SOURCE_IMAGE not found in project root"
    echo "Please save your favicon image as 'favicon-source.png' in the project root"
    exit 1
fi

echo "Generating favicons from $SOURCE_IMAGE..."

# Create favicon sizes
declare -a sizes=(
    "16:favicon-16x16.png"
    "32:favicon-32x32.png"
    "64:favicon-64x64.png"
    "180:apple-touch-icon.png"
    "192:icon-192x192.png"
    "192:icon-192x192-maskable.png"
    "512:icon-512x512.png"
    "512:icon-512x512-maskable.png"
)

for size_config in "${sizes[@]}"; do
    size="${size_config%:*}"
    filename="${size_config#*:}"
    filepath="$PUBLIC_DIR/$filename"

    convert "$SOURCE_IMAGE" \
        -background "rgba(0,0,0,0)" \
        -gravity center \
        -extent "${size}x${size}" \
        "$filepath"

    echo "✓ Generated $filename (${size}x${size})"
done

# Create favicon.ico (use 32x32 as base)
convert "$SOURCE_IMAGE" \
    -background "rgba(0,0,0,0)" \
    -gravity center \
    -extent "32x32" \
    "$PUBLIC_DIR/favicon.ico"

echo "✓ Generated favicon.ico (32x32)"

echo ""
echo "All favicons generated successfully!"
echo "The following files have been created:"
ls -lh "$PUBLIC_DIR"/favicon* "$PUBLIC_DIR"/icon-* "$PUBLIC_DIR"/apple-touch-icon.png 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
