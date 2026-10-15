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

/** Hard ceiling a whole proof must stay under, request document included. */
export const FIRESTORE_PROOF_LIMIT = FIRESTORE_DOC_LIMIT;

/** How many photos a single return proof may carry. */
export const MAX_PROOF_PHOTOS = 5;

/** Compression attempts, smallest/lossiest last. */
const PASSES = [
  { maxEdge: 1400, quality: 0.75 },
  { maxEdge: 1200, quality: 0.68 },
  { maxEdge: 1000, quality: 0.6 },
  { maxEdge: 800, quality: 0.55 },
  { maxEdge: 640, quality: 0.5 },
  { maxEdge: 520, quality: 0.45 },
];

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * Base64 budget for ONE photo in a proof carrying `count` photos.
 *
 * A proof is stored in a single Firestore document, so the whole set has to
 * share the same budget — more photos simply means less resolution each.
 */
export function proofPhotoBudget(count = 1) {
  const n = Math.max(1, Math.min(MAX_PROOF_PHOTOS, Number(count) || 1));
  return Math.floor(SAFE_PAYLOAD_BYTES / n);
}

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
 * @param {{maxBytes?: number}} [options] `maxBytes` caps the base64 payload of
 *   this single photo (use {@link proofPhotoBudget} when submitting several).
 * @returns {Promise<{ dataUrl: string, size: number, contentType: string, width: number, height: number }>}
 */
export async function prepareReturnProofImage(file, onProgress, options = {}) {
  const maxBytes = options.maxBytes || SAFE_PAYLOAD_BYTES;

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    // Could not decode (e.g. an unsupported format) — fall back to the original.
    return fromFile(file, maxBytes);
  }

  const totalPasses = PASSES.length;
  for (let i = 0; i < totalPasses; i++) {
    const { maxEdge, quality } = PASSES[i];
    onProgress?.(Math.round(((i + 1) / totalPasses) * 100));

    const blob = await renderJpeg(bitmap, maxEdge, quality);
    if (!blob) continue;

    // Base64 expands bytes by 4/3 — compare against the real budget.
    const estimatedBase64 = Math.ceil(blob.size / 3) * 4;
    if (estimatedBase64 > maxBytes && i < totalPasses - 1) continue;

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

async function fromFile(file, maxBytes = SAFE_PAYLOAD_BYTES) {
  const dataUrl = await blobToDataUrl(file);
  if (dataUrl.length > maxBytes) {
    throw new Error('This photo is too large to store. Please use a smaller or lower-resolution photo.');
  }
  return { dataUrl, size: file.size, contentType: file.type || 'image/jpeg', width: 0, height: 0 };
}

/**
 * Render source for the first photo of a stored return proof, or null when
 * there isn't one. Kept as the cheap "does a proof exist?" check.
 * @param {{dataUrl?: string}} proof
 */
export function proofSrc(proof) {
  return proof?.dataUrl || null;
}

/**
 * Every photo of a stored return proof, oldest submission order first.
 *
 * Proofs saved before multi-photo support only carry a top-level `dataUrl`,
 * so they come back as a single-item list.
 *
 * @param {{photos?: Array<object>, dataUrl?: string}} proof
 * @returns {Array<{dataUrl: string}>}
 */
export function proofPhotos(proof) {
  if (!proof) return [];
  if (Array.isArray(proof.photos) && proof.photos.length) {
    return proof.photos.filter(p => p?.dataUrl);
  }
  return proof.dataUrl ? [proof] : [];
}
