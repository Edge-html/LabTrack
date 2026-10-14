import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, X, Loader2 } from 'lucide-react';
import { validateImageFile } from '../lib/upload';

/**
 * Image picker with an inline preview, click-to-select and drag-and-drop.
 *
 * Compression and the actual upload are the caller's concern — this component
 * only validates and previews the picked File.
 */
export default function PhotoUpload({ file, previewUrl, onChange, error, disabled, hint }) {
  const inputRef = useRef(null);
  const [localError, setLocalError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files) {
    const picked = files?.[0];
    if (!picked) return;
    const msg = validateImageFile(picked);
    setLocalError(msg || '');
    onChange(msg ? null : picked);
  }

  const hasImage = !!file && !!previewUrl;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {hasImage ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <img
            src={previewUrl}
            alt="Return proof preview"
            className="w-full max-h-72 object-contain bg-gray-100"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                setLocalError('');
                onChange(null);
              }}
              className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow hover:bg-white text-gray-600 hover:text-red-600 transition-colors"
              aria-label="Remove photo"
            >
              <X size={16} />
            </button>
          )}
          <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200 bg-white flex items-center gap-1.5">
            <ImagePlus size={12} className="shrink-0" />
            <span className="truncate">{file.name}</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            if (!disabled) handleFiles(e.dataTransfer.files);
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
            {disabled ? 'Uploading…' : 'Tap to take or choose a photo'}
          </span>
          <span className="text-xs text-gray-400">
            {hint || 'JPG, PNG or WebP · up to 10 MB'}
          </span>
        </button>
      )}

      {(localError || error) && (
        <p className="text-xs text-red-600">{localError || error}</p>
      )}
    </div>
  );
}