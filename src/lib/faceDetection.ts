export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetectionResult {
  faces: FaceBox[];
  imageWidth: number;
  imageHeight: number;
}

declare global {
  interface Window {
    FaceDetector?: new (options?: { maxDetectedFaces?: number; fastMode?: boolean }) => {
      detect(image: ImageBitmapSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
    };
  }
}

async function detectWithNativeAPI(img: HTMLImageElement): Promise<FaceBox[] | null> {
  if (!('FaceDetector' in window) || !window.FaceDetector) return null;
  try {
    const detector = new window.FaceDetector({ maxDetectedFaces: 10, fastMode: false });
    const results = await detector.detect(img);
    return results.map((r) => ({
      x: r.boundingBox.x,
      y: r.boundingBox.y,
      width: r.boundingBox.width,
      height: r.boundingBox.height,
    }));
  } catch {
    return null;
  }
}

export async function detectFaces(imageFile: File): Promise<FaceDetectionResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[faceDetection] Timed out after 10s for', imageFile.name);
      resolve({ faces: [], imageWidth: 0, imageHeight: 0 });
    }, 10000);

    const done = (result: FaceDetectionResult) => {
      clearTimeout(timeout);
      resolve(result);
    };

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result) {
        console.warn('[faceDetection] FileReader produced empty result for', imageFile.name);
        done({ faces: [], imageWidth: 0, imageHeight: 0 });
        return;
      }

      img.onload = async () => {
        console.debug('[faceDetection] Image loaded:', img.width, 'x', img.height, 'for', imageFile.name);

        const nativeFaces = await detectWithNativeAPI(img);
        if (nativeFaces !== null) {
          console.debug('[faceDetection] Native API found', nativeFaces.length, 'faces for', imageFile.name);
          done({ faces: nativeFaces, imageWidth: img.width, imageHeight: img.height });
          return;
        }

        const faces = heuristicFaceDetection(img);
        console.debug('[faceDetection] Heuristic found', faces.length, 'faces for', imageFile.name);
        done({ faces, imageWidth: img.width, imageHeight: img.height });
      };

      img.onerror = () => {
        console.warn('[faceDetection] Image decode failed for', imageFile.name);
        done({ faces: [], imageWidth: 0, imageHeight: 0 });
      };

      img.src = e.target.result as string;
    };

    reader.onerror = () => {
      console.warn('[faceDetection] FileReader error for', imageFile.name, reader.error);
      done({ faces: [], imageWidth: 0, imageHeight: 0 });
    };

    reader.readAsDataURL(imageFile);
  });
}

function heuristicFaceDetection(img: HTMLImageElement): FaceBox[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const maxSize = 320;
  let width = img.width;
  let height = img.height;

  if (width > height) {
    if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
  } else {
    if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const skinPixels = findSkinPixels(imageData, width, height);
  const skinRatio = skinPixels.length / (width * height);

  if (skinRatio < 0.05) return [];

  const clusters = findClusters(skinPixels, width, height);
  const faces: FaceBox[] = [];

  const scaleX = img.width / width;
  const scaleY = img.height / height;

  for (const cluster of clusters) {
    if (cluster.length < width * height * 0.03) continue;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const idx of cluster) {
      const px = idx % width;
      const py = Math.floor(idx / width);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    const boxW = (maxX - minX) * scaleX;
    const boxH = (maxY - minY) * scaleY;
    const boxX = minX * scaleX;
    const boxY = minY * scaleY;

    faces.push({ x: boxX, y: boxY, width: boxW, height: boxH });
  }

  return faces;
}

function findSkinPixels(imageData: ImageData, _width: number, _height: number): number[] {
  const { data } = imageData;
  const skinPixels: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (isSkinTone(r, g, b)) {
      skinPixels.push(i / 4);
    }
  }

  return skinPixels;
}

function isSkinTone(r: number, g: number, b: number): boolean {
  const rgbCriteria =
    r > 95 && g > 40 && b > 20 &&
    r > g && r > b &&
    Math.abs(r - g) > 15;

  const yCbCr = {
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  };

  const yCbCrCriteria =
    yCbCr.cb >= 77 && yCbCr.cb <= 127 &&
    yCbCr.cr >= 133 && yCbCr.cr <= 173;

  return rgbCriteria && yCbCrCriteria;
}

function findClusters(pixels: number[], width: number, height: number): number[][] {
  const pixelSet = new Set(pixels);
  const visited = new Set<number>();
  const clusters: number[][] = [];

  for (const pixel of pixels) {
    if (visited.has(pixel)) continue;

    const cluster: number[] = [];
    const queue = [pixel];

    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;

      visited.add(current);
      cluster.push(current);

      const x = current % width;
      const candidates = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        current - width,
        current + width,
      ];

      for (const neighbor of candidates) {
        if (neighbor < 0 || neighbor >= width * height) continue;
        if (visited.has(neighbor)) continue;
        if (!pixelSet.has(neighbor)) continue;
        queue.push(neighbor);
      }
    }

    if (cluster.length > 0) {
      clusters.push(cluster);
    }
  }

  return clusters.sort((a, b) => b.length - a.length);
}
