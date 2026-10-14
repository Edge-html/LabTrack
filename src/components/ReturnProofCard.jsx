import React, { useState } from 'react';
import {
  Camera, Clock3, CheckCircle2, XCircle, AlertTriangle, Maximize2, MessageSquare, X,
} from 'lucide-react';
import { formatTimestamp, timeAgo } from '../lib/helpers';
import { proofSrc } from '../lib/upload';

/**
 * Renders a student's return-proof photo together with the time it was
 * submitted and, when present, the laboratory's assessment.
 *
 * @param {object} request The equipment request document (must carry `returnProof`).
 * @param {'sm'|'md'|'lg'} size
 */
export default function ReturnProofCard({ request, size = 'md' }) {
  const [lightbox, setLightbox] = useState(false);
  const proof = request?.returnProof;
  const review = request?.returnReview;
  const src = proofSrc(proof);

  if (!src) return null;

  const imgH = size === 'sm' ? 'max-h-40' : size === 'lg' ? 'max-h-[420px]' : 'max-h-64';

  return (
    <>
      <div className="space-y-3">
        {/* Photo */}
        <div className={`relative ${imgH} overflow-hidden rounded-xl border border-gray-200 bg-gray-50 group`}>
          <img
            src={src}
            alt="Return proof submitted by student"
            className={`w-full ${imgH} object-contain`}
          />
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg shadow hover:bg-white text-gray-600 transition-colors"
            aria-label="View full size"
          >
            <Maximize2 size={15} />
          </button>
          {request.returnAttempt > 1 && (
            <span className="absolute bottom-2 left-1 px-2 py-0.5 bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider rounded">
              Re-submission #{request.returnAttempt}
            </span>
          )}
        </div>

        {/* When it was submitted */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={12} className="shrink-0" />
            Return proof sent {formatTimestamp(request.returnSubmittedAt)}
          </span>
          <span className="text-gray-400">({timeAgo(request.returnSubmittedAt)})</span>
          {proof.width > 0 && (
            <span className="text-gray-400">
              {proof.width}×{proof.height} · {Math.round((proof.size || 0) / 1024)} KB
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

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <img
            src={src}
            alt="Return proof (full size)"
            className="max-h-full max-w-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
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