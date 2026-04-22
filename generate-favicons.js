import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 48, name: 'favicon.ico', format: 'ico' },
  { size: 64, name: 'favicon-64x64.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 192, name: 'icon-192x192-maskable.png' },
  { size: 512, name: 'icon-512x512.png' },
  { size: 512, name: 'icon-512x512-maskable.png' },
  { size: 180, name: 'apple-touch-icon.png' }
];

async function generateFavicons() {
  const publicDir = path.join(process.cwd(), 'public');

  for (const { size, name, format } of sizes) {
    try {
      const outputPath = path.join(publicDir, name);
      const ext = path.extname(name).toLowerCase();
      
      let transform = sharp('favicon.png').resize(size, size, {
        fit: 'cover',
        position: 'center'
      });

      if (format === 'ico') {
        await transform.toFile(outputPath);
      } else if (ext === '.png') {
        await transform.png().toFile(outputPath);
      }

      console.log(`Generated ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`Error generating ${name}:`, error.message);
    }
  }
}

generateFavicons();
