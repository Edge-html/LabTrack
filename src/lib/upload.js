import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Client-side image downscaling.
 *
 * Phone cameras produce 4–12 MB files, which is slow to upload and slow for
 * admins to open. We re-encode to JPEG at a bounded longest edge, which keeps
 * return-proof photos under ~300 KB in practice.
 *
 * Falls back to the original file if canvas encoding is unavailable.
 */
export async function compressImage(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );

    // Only use the compressed version if it is actually smaller.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
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

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB, matches storage.rules

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

function safeFileName(name) {
  return (name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
}

/**
 * Upload a return-proof photo to Firebase Storage.
 *
 * @param {object}   opts
 * @param {string}   opts.uid       Owner of the photo (the student).
 * @param {string}   opts.requestId Owning equipment request id.
 * @param {File}     opts.file      Already-validated image file.
 * @param {number}   [opts.attempt] Increment to bust the cache when re-uploading.
 * @param {Function} [opts.onProgress] Called with 0–100.
 * @returns {Promise<{ url: string, path: string }>}
 */
export function uploadReturnProof({ uid, requestId, file, attempt = 0, onProgress }) {
  if (!storage) {
    return Promise.reject(new Error('File storage is not configured. Please contact the laboratory staff.'));
  }
  const path = `returnProofs/${uid}/${requestId}/${Date.now()}-${safeFileName(file.name)}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: `private,max-age=${60 * 60},immutable=${attempt > 0}`,
  });

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const pct = snap.totalBytes > 0 ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
        onProgress?.(pct);
      },
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, path });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Best-effort delete of an uploaded proof, used when a student replaces a
 * photo the admin had already flagged. Failures are non-fatal.
 */
export async function deleteReturnProof(path) {
  if (!storage || !path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    /* ignore — orphaned files are harmless, never block the student's flow */
  }
}