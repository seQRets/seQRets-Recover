// QR decoding for the recover app.
//
// Two entry points:
//   decodeQrFromFile(file)     — decode a QR from a user-supplied image file
//                                (photo of a printed Qard, screenshot, etc).
//   startCameraScan(video, cb) — open the device camera and scan live frames
//                                until a QR is found, calling cb(text).
//
// The image path uses ZXing's MultiFormatReader with the TRY_HARDER hint, which
// tolerates perspective, glare, and moderate blur far better than jsQR. If the
// first pass fails we retry against several preprocessing variants (binarized,
// contrast-boosted, and rotated) before giving up. In practice this succeeds
// on the kind of hand-held phone photos heirs will actually produce.

import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  NotFoundException,
} from '@zxing/library';
import { BrowserMultiFormatReader } from '@zxing/browser';

// ── Public API ────────────────────────────────────────────────────────

export async function decodeQrFromFile(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);

  // Clamp large images so preprocessing/decoding stays fast. ZXing is roughly
  // linear in pixel count; 2000px on the long edge is plenty for a QR to be
  // readable.
  const MAX_DIM = 2000;
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error(
      'Your browser does not support canvas rendering, which this tool needs to read QR codes.',
    );
  }

  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  const baseImage = ctx.getImageData(0, 0, w, h);

  const reader = makeReader();

  // Try each variant in turn. The first successful decode wins.
  const variants: Array<() => ImageData> = [
    () => baseImage,
    () => enhanceContrast(baseImage),
    () => rotate90(baseImage),
    () => rotate180(baseImage),
    () => rotate270(baseImage),
  ];

  for (const make of variants) {
    try {
      const text = decodeImageData(reader, make());
      if (text) return text;
    } catch {
      // Try the next variant.
    }
  }

  throw new Error(
    `Could not read a QR code in "${file.name}". ` +
      'Try using the "Scan with camera" button above, or open your phone camera, ' +
      'point it at the card, tap the text that appears, copy it, and paste it below.',
  );
}

/**
 * Start a live camera scan. Returns a handle with a stop() method.
 *
 * Resolves `onDecoded` with the QR text the first time a frame decodes
 * successfully. The caller is responsible for calling stop() when done
 * (either after a successful decode or when the user cancels).
 *
 * Rejects if the browser blocks camera access (file:// origin, denied
 * permission, no camera, etc).
 */
export async function startCameraScan(
  video: HTMLVideoElement,
  onDecoded: (text: string) => void,
  onError: (err: Error) => void,
): Promise<{ stop: () => void }> {
  if (!cameraScanSupported()) {
    throw new Error(
      'Camera scanning is not available here. This usually happens when the page is ' +
        'opened directly from a file (file://). Open the hosted version at ' +
        'https://seqrets.github.io/seQRets-Recover/ to use the camera, or upload a ' +
        'photo of your card below.',
    );
  }

  const reader = new BrowserMultiFormatReader(makeHints());

  // Prefer the rear camera on phones. `facingMode: 'environment'` is a hint
  // that falls back gracefully on laptops (which only have a front camera).
  let deviceId: string | undefined;
  try {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    const rear = devices.find(d => /back|rear|environment/i.test(d.label));
    deviceId = (rear ?? devices[0])?.deviceId;
  } catch {
    // listVideoInputDevices can fail before permission is granted; falling back
    // to undefined lets decodeFromVideoDevice prompt and pick a default.
  }

  const controls = await reader.decodeFromVideoDevice(
    deviceId,
    video,
    (result, err) => {
      if (result) {
        onDecoded(result.getText());
      } else if (err && !(err instanceof NotFoundException)) {
        // NotFoundException just means "no QR in this frame" — normal. Other
        // errors (e.g. camera disconnected mid-scan) should bubble up.
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    },
  );

  return { stop: () => controls.stop() };
}

export function cameraScanSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  // getUserMedia requires a "secure context". file:// is not secure. localhost
  // is considered secure by modern browsers.
  if (typeof window !== 'undefined' && 'isSecureContext' in window) {
    return window.isSecureContext === true;
  }
  return false;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

// ── Internals ─────────────────────────────────────────────────────────

function makeHints(): Map<DecodeHintType, unknown> {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  // TRY_HARDER enables a slower but more forgiving decode path — exactly what
  // we want for hand-held photos of printed cards.
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

function makeReader(): MultiFormatReader {
  const reader = new MultiFormatReader();
  reader.setHints(makeHints());
  return reader;
}

function decodeImageData(reader: MultiFormatReader, img: ImageData): string | null {
  // ZXing wants a "luminance source" — a grayscale view of the image. Its
  // RGBLuminanceSource expects packed 32-bit RGBA integers, not Uint8ClampedArray.
  const len = img.width * img.height;
  const luminances = new Int32Array(len);
  const src = img.data;
  for (let i = 0, p = 0; i < len; i++, p += 4) {
    luminances[i] =
      (0xff << 24) | (src[p] << 16) | (src[p + 1] << 8) | src[p + 2];
  }
  const luminance = new RGBLuminanceSource(luminances, img.width, img.height);
  const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminance));
  try {
    const result = reader.decode(binaryBitmap);
    return result.getText();
  } catch (err) {
    if (err instanceof NotFoundException) return null;
    throw err;
  } finally {
    reader.reset();
  }
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

// ── Preprocessing variants ────────────────────────────────────────────

function enhanceContrast(src: ImageData): ImageData {
  // Simple histogram-stretch on the luminance channel. Helps when the photo
  // has low dynamic range (backlit card, dim room).
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const range = max - min || 1;
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    const stretched = ((y - min) * 255) / range;
    const v = stretched < 0 ? 0 : stretched > 255 ? 255 : stretched;
    d[i] = d[i + 1] = d[i + 2] = v;
    // alpha unchanged
  }
  return out;
}

function rotate90(src: ImageData): ImageData {
  const { width: w, height: h, data: s } = src;
  const out = new ImageData(h, w);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      // new coords: (h - 1 - y, x)
      const di = (x * h + (h - 1 - y)) * 4;
      d[di] = s[si];
      d[di + 1] = s[si + 1];
      d[di + 2] = s[si + 2];
      d[di + 3] = s[si + 3];
    }
  }
  return out;
}

function rotate180(src: ImageData): ImageData {
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const d = out.data;
  const n = s.length;
  for (let i = 0; i < n; i += 4) {
    const j = n - 4 - i;
    d[i] = s[j];
    d[i + 1] = s[j + 1];
    d[i + 2] = s[j + 2];
    d[i + 3] = s[j + 3];
  }
  return out;
}

function rotate270(src: ImageData): ImageData {
  const { width: w, height: h, data: s } = src;
  const out = new ImageData(h, w);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      // new coords: (y, w - 1 - x)
      const di = ((w - 1 - x) * h + y) * 4;
      d[di] = s[si];
      d[di + 1] = s[si + 1];
      d[di + 2] = s[si + 2];
      d[di + 3] = s[si + 3];
    }
  }
  return out;
}
