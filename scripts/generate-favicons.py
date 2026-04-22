#!/usr/bin/env python3
"""
Favicon Generator for Garden App
Generates favicon set from a source image
Usage: python3 scripts/generate-favicons.py
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow library is required but not installed")
    print("Install it with: pip install Pillow")
    sys.exit(1)

def generate_favicons(source_path: str = "favicon-source.png", output_dir: str = "public"):
    """Generate favicon set from source image."""

    source = Path(source_path)
    output = Path(output_dir)

    if not source.exists():
        print(f"Error: {source_path} not found in project root")
        print("Please save your favicon image as 'favicon-source.png'")
        sys.exit(1)

    if not output.exists():
        output.mkdir(parents=True, exist_ok=True)

    # Open source image
    try:
        img = Image.open(source)
        print(f"Loaded source image: {source_path} ({img.size[0]}x{img.size[1]})")
    except Exception as e:
        print(f"Error loading image: {e}")
        sys.exit(1)

    # Favicon configurations
    favicons = [
        ("favicon-16x16.png", 16),
        ("favicon-32x32.png", 32),
        ("favicon-64x64.png", 64),
        ("apple-touch-icon.png", 180),
        ("icon-192x192.png", 192),
        ("icon-192x192-maskable.png", 192),
        ("icon-512x512.png", 512),
        ("icon-512x512-maskable.png", 512),
    ]

    print(f"Generating favicons in {output_dir}/...\n")

    for filename, size in favicons:
        try:
            # Resize image to fit within size x size (preserving aspect ratio)
            resized = img.copy()
            resized.thumbnail((size, size), Image.Resampling.LANCZOS)

            # Create new image with transparent background
            final = Image.new("RGBA", (size, size), (0, 0, 0, 0))

            # Center the resized image
            offset = (
                (size - resized.width) // 2,
                (size - resized.height) // 2
            )
            final.paste(resized, offset, resized if resized.mode == "RGBA" else None)

            # Save
            output_path = output / filename
            final.save(output_path, "PNG")
            print(f"✓ Generated {filename} ({size}x{size})")

        except Exception as e:
            print(f"✗ Error generating {filename}: {e}")

    # Generate favicon.ico from 32x32
    try:
        resized = img.copy()
        resized.thumbnail((32, 32), Image.Resampling.LANCZOS)
        final = Image.new("RGB", (32, 32), (255, 255, 255))
        offset = ((32 - resized.width) // 2, (32 - resized.height) // 2)
        final.paste(resized, offset)

        ico_path = output / "favicon.ico"
        final.save(ico_path, "ICO")
        print(f"✓ Generated favicon.ico (32x32)")
    except Exception as e:
        print(f"✗ Error generating favicon.ico: {e}")

    print(f"\nAll favicons generated successfully!")
    print(f"Files created in: {output_dir}/")

if __name__ == "__main__":
    generate_favicons()
