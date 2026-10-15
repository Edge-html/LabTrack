import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Images, X, Loader2 } from 'lucide-react';
import { validateImageFile, MAX_PROOF_PHOTOS } from '../lib/upload';

/**
 * Multi-photo picker with thumbnails, click-to-select, drag-and-drop and a
 * dedicated camera trigger for phones.
 *
 * Compression and the actual upload are the caller's concern — this component
 * only validates and previews the picked Files.
 */
export default function PhotoUpload({
  files = [],
  previews = [],
  onChange,
  error,
  disabled,
  hint,
  max = MAX_PROOF_PHOTOS,
}) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [localError, setLocalError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const roomLeft = max - files.length;
  const full = files.length >= max;

  function addFiles(picked) {
    if (disabled || !picked?.length) return;

    const accepted = [];
    let msg = '';

    for (const file of Array.from(picked)) {
      if (accepted.length >= roomLeft) {
        msg = `You can attach up to ${max} photos.`;
        break;
      }
      const problem = validateImageFile(file);
      if (problem && !msg) msg = problem;
      else if (!problem) accepted.push(file);
    }

    setLocalError(msg);
    onChange?.([...files, ...accepted]);
  }

  function removeAt(index) {
    setLocalError('');
    onChange?.(files.filter((_, i) => i !== index));
  }

  const picker = (
    <input
      ref={cameraRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      disabled={disabled}
      onChange={e => {
        addFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );

  const gallery = (
    <input
      ref={galleryRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      disabled={disabled}
      onChange={e => {
        addFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );

  const addButtons = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        disabled={disabled || full}
        onClick={() => cameraRef.current?.click()}
        className="btn-secondary btn-sm"
      >
        <Camera size={14} /> Take photo
      </button>
      <button
        type="button"
        disabled={disabled || full}
        onClick={() => galleryRef.current?.click()}
        className="btn-secondary btn-sm"
      >
        <Images size={14} /> Choose photos
      </button>
    </div>
  );

  return (
    <div className="space-y-2">
      {picker}
      {gallery}

      {files.length === 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => galleryRef.current?.click()}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            if (!disabled) addFiles(e.dataTransfer.files);
          }}
          className={`w-full flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed transition-colors ${
            dragOver
              ? 'border-gold bg-gold-pale/50'
              : 'border-gray-300 bg-gray-50 hover:border-gold hover:bg-gold-pale/30'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {disabled ? (
            <Loader2 size={28} className="text-gray-300 animate-spin" />
          ) : (
            <Camera size={28} className="text-gray-400" strokeWidth={1.6} />
          )}
          <span className="text-sm font-medium text-gray-700">
            {disabled ? 'Uploading…' : 'Tap to take or choose photos'}
          </span>
          <span className="text-xs text-gray-400">
            {hint || `Up to ${max} photos · JPG, PNG or WebP · up to 10 MB each`}
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${file.size}-${i}`}
                className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group"
              >
                <img
                  src={previews[i]}
                  alt={`Return proof photo ${i + 1}`}
                  className="w-full h-28 object-cover"
                />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full shadow hover:bg-white text-gray-600 hover:text-red-600 transition-colors"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <X size={14} />
                  </button>
                )}
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/65 text-white text-[10px] font-bold rounded">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                <ImagePlus size={12} className="shrink-0" />
                {files.length} of {max} photo{files.length > 1 ? 's' : ''} attached
              </p>
              {!full && !disabled && (
                <button
                  type="button"
                  onClick={() => onChange?.([])}
                  className="text-xs font-medium text-red-500 hover:text-red-600"
                >
                  Clear all
                </button>
              )}
            </div>
            {!full && <div className="flex justify-center">{addButtons}</div>}
            {full && (
              <p className="text-center text-xs text-gray-400">
                Maximum of {max} photos reached — remove one to attach another.
              </p>
            )}
          </div>
        </div>
      )}

      {(localError || error) && (
        <p className="text-xs text-red-600">{localError || error}</p>
      )}
    </div>
  );
}