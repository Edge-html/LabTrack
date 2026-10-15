import React, { useState } from 'react';
import {
  Clock3, CheckCircle2, XCircle, AlertTriangle, Maximize2, MessageSquare, X,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { formatTimestamp, timeAgo } from '../lib/helpers';
import { proofPhotos } from '../lib/upload';

/**
 * Renders a student's return-proof photo(s) together with the time it was
 * submitted and, when present, the laboratory's assessment.
 *
 * @param {object} request The equipment request document (must carry `returnProof`).
 * @param {'sm'|'md'|'lg'} size
 */
export default function ReturnProofCard({ request, size = 'md' }) {
  const [lightbox, setLightbox] = useState(null);
  const proof = request?.returnProof;
  const review = request?.returnReview;
  const photos = proofPhotos(proof);

  if (!photos.length) return null;

  const open = lightbox != null && photos[lightbox] ? lightbox : null;
  const imgH = size === 'sm' ? 'max-h-40' : size === 'lg' ? 'max-h-[420px]' : 'max-h-64';
  const gridCols = photos.length === 1 ? '' : photos.length === 2 ? 'sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';
  const totalSize = photos.reduce((sum, p) => sum + (p.size || 0), 0);

  return (
    <>
      <div className="space-y-3">
        {/* Photos */}
        <div className={`grid grid-cols-1 gap-2 ${gridCols}`}>
          {photos.map((photo, i) => (
            <div
              key={i}
              className={`relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 group ${photos.length === 1 ? imgH : ''}`}
            >
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className={`block w-full ${photos.length === 1 ? imgH : ''}`}
                aria-label={`View proof photo ${i + 1} full size`}
              >
                <img
                  src={photo.dataUrl}
                  alt={`Return proof photo ${i + 1} submitted by student`}
                  className={`w-full object-contain ${photos.length === 1 ? imgH : 'h-44'}`}
                />
              </button>
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg shadow hover:bg-white text-gray-600 transition-colors"
                aria-label="View full size"
              >
                <Maximize2 size={15} />
              </button>
              {photos.length > 1 && (
                <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider rounded">
                  {i + 1} of {photos.length}
                </span>
              )}
              {request.returnAttempt > 1 && i === 0 && (
                <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider rounded">
                  Re-submission #{request.returnAttempt}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* When it was submitted */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={12} className="shrink-0" />
            Return proof sent {formatTimestamp(request.returnSubmittedAt)}
          </span>
          <span className="text-gray-400">({timeAgo(request.returnSubmittedAt)})</span>
          {photos.length > 1 && (
            <span className="text-gray-400">{photos.length} photos attached</span>
          )}
          {proof.width > 0 && (
            <span className="text-gray-400">
              {proof.width}×{proof.height} · {Math.round(totalSize / 1024)} KB
            </span>
          )}
        </div>

        {/* Student note */}
        {request.returnSubmittedNote && (
          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <MessageSquare size={14} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">{request.returnSubmittedNote}</p>
          </div>
        )}

        {/* Laboratory assessment */}
        {review && <VerdictBanner review={review} />}
      </div>

      {open != null && (
        <Lightbox
          photos={photos}
          index={open}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}

function Lightbox({ photos, index, onIndex, onClose }) {
  const go = delta => {
    onIndex((index + delta + photos.length) % photos.length);
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
        aria-label="Close"
      >
        <X size={20} />
      </button>

      {photos.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); go(-1); }}
            className="absolute left-3 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
            aria-label="Previous photo"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); go(1); }}
            className="absolute right-3 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
            aria-label="Next photo"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <img
        src={photos[index].dataUrl}
        alt={`Return proof ${index + 1} (full size)`}
        className="max-h-full max-w-full object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />

      {photos.length > 1 && (
        <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white text-xs font-semibold bg-black/50 px-3 py-1 rounded-full">
          {index + 1} / {photos.length}
        </p>
      )}
    </div>
  );
}

const VERDICT_STYLES = {
  clean: {
    icon: CheckCircle2,
    cls: 'bg-green-50 border-green-200 text-green-800',
    iconCls: 'text-green-600',
    title: 'Approved — clean and no damage',
  },
  damaged: {
    icon: AlertTriangle,
    cls: 'bg-red-50 border-red-200 text-red-800',
    iconCls: 'text-red-600',
    title: 'Rejected — equipment is damaged',
  },
  not_cleaned: {
    icon: AlertTriangle,
    cls: 'bg-amber-50 border-amber-200 text-amber-800',
    iconCls: 'text-amber-600',
    title: 'Rejected — equipment was not cleaned',
  },
};

export function VerdictBanner({ review }) {
  if (!review) return null;
  const style = VERDICT_STYLES[review.verdict] || {
    icon: XCircle,
    cls: 'bg-gray-50 border-gray-200 text-gray-800',
    iconCls: 'text-gray-600',
    title: 'Reviewed',
  };
  const Icon = style.icon;

  return (
    <div className={`flex items-start gap-2.5 p-3 border rounded-xl ${style.cls}`}>
      <Icon size={16} className={`${style.iconCls} shrink-0 mt-0.5`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{style.title}</p>
        {review.remarks && <p className="text-sm mt-1">{review.remarks}</p>}
        {review.requiresLabVisit && (
          <p className="text-sm font-semibold mt-1.5 flex items-center gap-1.5">
            <AlertTriangle size={13} />
            You are required to report to the laboratory.
          </p>
        )}
        {review.reviewedAt && (
          <p className="text-xs opacity-75 mt-1.5">
            Assessed {formatTimestamp(review.reviewedAt)}
            {review.reviewedByName ? ` by ${review.reviewedByName}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}