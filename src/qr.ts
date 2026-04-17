// Decode a QR code image file into its embedded text.
// Uses jsQR (MIT, pure JS, no WebAssembly) — draws the image to an offscreen
// canvas and runs the QR decoder against its pixel data.

import jsQR from 'jsqr';

export async function decodeQrFromFile(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);

  // Clamp very large images to keep the pixel scan tractable. jsQR runs in O(pixels),
  // and printed Qards tend to produce high-resolution scans (4–8 MP phone photos).
  const MAX_DIM = 2000;
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser does not support canvas rendering, which this tool needs to read QR codes.');

  ctx.drawImage(bitmap, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  const result = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
  if (!result) {
    throw new Error(`Could not read a QR code in "${file.name}". Try a clearer photo, a flat angle, or better lighting.`);
  }

  return result.data;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> path
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load "${file.name}" as an image.`));
    };
    img.src = url;
  });
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  // Fallback on extension for files with missing MIME types (common on Linux/Windows).
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name);
}
