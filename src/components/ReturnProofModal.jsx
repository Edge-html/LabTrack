import React, { useState, useEffect } from 'react';
import { Camera, Upload, ShieldCheck, Loader2 } from 'lucide-react';
import PhotoUpload from './PhotoUpload';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  prepareReturnProofImage,
  proofPhotoBudget,
  MAX_PROOF_PHOTOS,
  FIRESTORE_PROOF_LIMIT,
} from '../lib/upload';
import { getTodayManila, formatDate } from '../lib/helpers';
import { useToast } from '../context/ToastContext';

/**
 * Student-facing modal for submitting photographic proof of an equipment return.
 *
 * Submitting moves the request from `borrowed` / `return_flagged` to
 * `return_submitted`, which puts it in the admin's review queue. The request is
 * NOT marked returned here — only laboratory staff can do that.
 *
 * Students may attach several photos (e.g. one angle per item); they are
 * compressed as a set so the whole proof still fits in one Firestore document.
 */
export default function ReturnProofModal({ request, onClose, onDone }) {
  const toast = useToast();

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [note, setNote] = useState('');
  const [returnDate, setReturnDate] = useState(getTodayManila());
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isResubmit = request.status === 'return_flagged';
  const attempt = request.returnAttempt || 0;

  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!files.length) {
      setError('At least one photo is required as proof of return.');
      return;
    }

    setBusy(true);
    setError('');
    setProgress(0);

    try {
      // The whole set shares one budget, so more photos = less resolution each.
      const budget = proofPhotoBudget(files.length);
      const photos = [];

      for (let i = 0; i < files.length; i++) {
        const prepared = await prepareReturnProofImage(
          files[i],
          pct => setProgress(Math.round(((i + pct / 100) / files.length) * 100)),
          { maxBytes: budget },
        );
        photos.push({ ...prepared, name: files[i].name });
      }

      const payload = photos.reduce((sum, p) => sum + p.dataUrl.length, 0);
      if (payload > FIRESTORE_PROOF_LIMIT) {
        throw new Error('These photos are too large to store together. Please attach fewer or smaller photos.');
      }

      // `dataUrl` mirrors the first photo so older readers keep working.
      const [first] = photos;

      await updateDoc(doc(db, 'requests', request.id), {
        status: 'return_submitted',
        returnProof: {
          dataUrl: first.dataUrl,
          contentType: first.contentType,
          size: first.size,
          width: first.width,
          height: first.height,
          count: photos.length,
          photos,
          capturedAt: serverTimestamp(),
        },
        returnSubmittedAt: serverTimestamp(),
        returnSubmittedNote: note.trim(),
        proposedReturnDate: returnDate,
        returnAttempt: attempt + 1,
        updatedAt: serverTimestamp(),
      });

      toast.success(
        files.length > 1
          ? `${files.length} proof photos submitted. The laboratory staff will check them.`
          : 'Return proof submitted. The laboratory staff will check your photo.'
      );
      onDone?.();
    } catch (err) {
      setError(err.message || 'Could not process the photos. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in max-h-[92vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Camera size={18} className="text-crimson" />
          {isResubmit ? 'Re-submit Return Proof' : 'Submit Return Proof'}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {request.borrowerName} · {request.experiment}
        </p>

        {isResubmit && (
          <div className="mb-4 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
            <ShieldCheck size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">Your previous proof was not accepted.</p>
              <p className="mt-1">
                {request.returnReview?.remarks || 'The equipment was assessed as damaged or not properly cleaned.'}
              </p>
              <p className="mt-1 font-medium">
              Please clean and repair the equipment, then capture new camera photos — or report directly to the laboratory.
              </p>
            </div>
          </div>
        )}

        <div className="mb-4 p-3 bg-gold-pale/40 border border-gold/30 rounded-xl">
          <p className="text-xs font-semibold text-crimson-dark uppercase tracking-wide mb-1">Equipment</p>
          <ul className="text-sm text-gray-700 space-y-0.5">
            {(request.items || []).map((item, i) => (
              <li key={i}>
                {item.name} <span className="text-gray-400">× {item.qtyReleased || item.qtyRequested}</span>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">
              Live Camera Proof * <span className="text-gray-400 font-normal">(up to {MAX_PROOF_PHOTOS} photos)</span>
            </label>
            <PhotoUpload
              files={files}
              previews={previews}
              onChange={next => { setFiles(next || []); setError(''); }}
              disabled={busy}
              hint="Use your device camera to photograph the cleaned equipment on the lab table"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Date Returned</label>
              <input
                type="date"
                className="input"
                value={returnDate}
                max={getTodayManila()}
                onChange={e => setReturnDate(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label className="label">Expected Return</label>
              <input className="input bg-gray-50" value={formatDate(request.expectedReturnDate)} readOnly />
            </div>
          </div>

          {returnDate > request.expectedReturnDate && (
            <div className="flex items-center gap-2 text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-sm">
              This is past the expected return date — it may incur a late penalty.
            </div>
          )}

          <div>
            <label className="label">Note to Laboratory Staff (optional)</label>
            <textarea
              className="input min-h-[70px] resize-none"
              placeholder="Anything the staff should know about the condition of the equipment…"
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={busy}
              maxLength={500}
            />
          </div>

          {busy && (
            <div className="space-y-1.5">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-crimson transition-all duration-200"
                  style={{ width: `${Math.max(progress, 5)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 text-center">
                {progress > 0 && progress < 100
                  ? `Optimising ${files.length > 1 ? `${files.length} photos` : 'photo'}… ${progress}%`
                  : 'Saving photo…'}
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="btn-primary btn-sm">
              {busy ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <Upload size={14} /> Submit Proof
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
