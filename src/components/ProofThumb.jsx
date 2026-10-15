import React from 'react';
import { Images } from 'lucide-react';
import { proofPhotos } from '../lib/upload';

/**
 * Compact return-proof thumbnail. Shows the first photo plus a badge when the
 * proof carries more than one.
 */
export default function ProofThumb({ proof, className = 'w-9 h-9' }) {
  const photos = proofPhotos(proof);
  if (!photos.length) return null;

  return (
    <span className="relative inline-block shrink-0 align-middle">
      <img
        src={photos[0].dataUrl}
        alt="Return proof"
        className={`${className} object-cover rounded-lg border border-gray-200`}
      />
      {photos.length > 1 && (
        <span
          className="absolute -bottom-1 -right-1 inline-flex items-center gap-0.5 px-1 py-0.5 bg-crimson text-white text-[9px] font-bold rounded-full ring-1 ring-white"
          title={`${photos.length} photos attached`}
        >
          <Images size={8} /> {photos.length}
        </span>
      )}
    </span>
  );
}