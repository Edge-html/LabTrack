/**
 * Return-proof image preparation.
 *
 * This project runs on the Firebase Spark (free) plan, which does NOT include
 * Cloud Storage — only the Blaze plan does. So instead of uploading files to a
 * bucket, photos are downscaled client-side and stored as a base64 data URL
 * inside the request document.
 *
 * Firestore caps a document at 1 MiB, and base64 inflates binary data by ~33%,
 * so we aggressively compress to stay well under that ceiling.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // what we accept from the camera roll
const FIRESTORE_DOC_LIMIT = 1048576;       // 1 MiB hard limit
const SAFE_PAYLOAD_BYTES = 700 * 1024;    // base64 budget, leaves headroom

/** Compression attempts, smallest/lossiest last. */
const PASSES = [
  { maxEdge: 1400, quality: 0.75 },
  { maxEdge: 1200, quality: 0.68 },
  { maxEdge: 1000, quality: 0.6 },
  { maxEdge: 800, quality: 0.55 },
];

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * Validate a picked file before we spend time compressing it.
 * @returns {string|null} an error message, or null when the file is fine.
 */
export function validateImageFile(file) {
  if (!file) return 'Please choose a photo.';
  if (!file.type.startsWith('image/')) return 'Only image files are allowed.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Photo is too large. Maximum size is 10 MB.';
  return null;
}

function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaImgElement(file));
  }
  return loadViaImgElement(file);
}

function loadViaImgElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function renderJpeg(bitmap, maxEdge, quality) {
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Photos are often shot against a light bench; keep backgrounds honest.
  ctx.drawImage(bitmap, 0, 0, w, h);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Downscale, re-encode to JPEG, and return a base64 data URL that fits inside
 * a Firestore document.
 *
 * @param {File} file
 * @param {(0-100:number)=>void} [onProgress]
 * @returns {Promise<{ dataUrl: string, size: number, contentType: string, width: number, height: number }>}
 */
export async function prepareReturnProofImage(file, onProgress) {
  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    // Could not decode (e.g. an unsupported format) — fall back to the original.
    return fromFile(file);
  }

  const totalPasses = PASSES.length;
  for (let i = 0; i < totalPasses; i++) {
    const { maxEdge, quality } = PASSES[i];
    onProgress?.(Math.round(((i + 1) / totalPasses) * 100));

    const blob = await renderJpeg(bitmap, maxEdge, quality);
    if (!blob) continue;

    // Base64 expands bytes by 4/3 — compare against the real budget.
    const estimatedBase64 = Math.ceil(blob.size / 3) * 4;
    if (estimatedBase64 > SAFE_PAYLOAD_BYTES && i < totalPasses - 1) continue;

    const srcW = bitmap.width || bitmap.naturalWidth;
    const srcH = bitmap.height || bitmap.naturalHeight;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));

    const dataUrl = await blobToDataUrl(blob);

    if (bitmap.close) bitmap.close();
    return {
      dataUrl,
      size: blob.size,
      contentType: 'image/jpeg',
      width: Math.round(srcW * scale),
      height: Math.round(srcH * scale),
    };
  }

  if (bitmap.close) bitmap.close();
  throw new Error(
    'This photo is too detailed to process. Please retake it closer to the equipment.'
  );
}

async function fromFile(file) {
  const dataUrl = await blobToDataUrl(file);
  if (dataUrl.length > FIRESTORE_DOC_LIMIT) {
    throw new Error('This photo is too large to store. Please use a smaller or lower-resolution photo.');
  }
  return { dataUrl, size: file.size, contentType: file.type || 'image/jpeg', width: 0, height: 0 };
}

/**
 * Render source for a stored return proof, or null when there isn't one.
 * @param {{dataUrl?: string}} proof
 */
export function proofSrc(proof) {
  return proof?.dataUrl || null;
}