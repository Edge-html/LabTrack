import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { validateImageFile, MAX_PROOF_PHOTOS } from '../lib/upload';

/** Live camera capture for return evidence. Gallery and file upload are intentionally unavailable. */
export default function PhotoUpload({
  files = [], previews = [], onChange, error, disabled, hint, max = MAX_PROOF_PHOTOS,
}) {
  const videoRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [localError, setLocalError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const roomLeft = max - files.length;

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let cancelled = false;
    let stream;
    setCameraReady(false);
    setLocalError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setLocalError('Live camera capture is unavailable in this browser. Open LabTrack over HTTPS on a camera-enabled device.');
      return () => {};
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(cameraStream => {
        if (cancelled) {
          cameraStream.getTracks().forEach(track => track.stop());
          return;
        }
        stream = cameraStream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          return videoRef.current.play();
        }
      })
      .then(() => { if (!cancelled) setCameraReady(true); })
      .catch(err => {
        if (!cancelled) setLocalError(err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser and try again.'
          : 'Could not open the device camera. Check that no other app is using it.');
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOpen]);

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setLocalError('The camera is not ready yet.');
      return;
    }
    setCapturing(true);
    setLocalError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not capture an image from the camera.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
      if (!blob) throw new Error('Could not capture an image from the camera. Please try again.');
      const file = new File([blob], `return-proof-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const problem = validateImageFile(file);
      if (problem) throw new Error(problem);
      onChange?.([...files, file]);
      setCameraOpen(false);
    } catch (err) {
      setLocalError(err.message || 'Could not capture a photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="space-y-2">
      {cameraOpen ? (
        <div className="rounded-xl border border-gray-200 bg-gray-950 p-3 space-y-3">
          <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-72 rounded-lg object-contain bg-black" />
          <p className="text-center text-xs text-white/70">Live camera preview · {hint || 'Photograph the equipment being returned'}</p>
          <div className="flex justify-center gap-2">
            <button type="button" disabled={capturing} onClick={() => setCameraOpen(false)} className="btn-secondary btn-sm">Cancel</button>
            <button type="button" disabled={!cameraReady || capturing || disabled} onClick={capturePhoto} className="btn-primary btn-sm">
              {capturing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {capturing ? 'Capturing…' : 'Capture photo'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {files.length === 0 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => { setLocalError(''); setCameraOpen(true); }}
              className="w-full flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-gold hover:bg-gold-pale/30 disabled:opacity-50"
            >
              <Camera size={28} className="text-gray-400" strokeWidth={1.6} />
              <span className="text-sm font-medium text-gray-700">Open camera to take return proof</span>
              <span className="text-xs text-gray-400">Live capture only · up to {max} photos</span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {files.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${index}`} className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={previews[index]} alt={`Live return proof photo ${index + 1}`} className="w-full h-28 object-cover" />
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => { setLocalError(''); onChange?.(files.filter((_, i) => i !== index)); }}
                        className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full shadow text-gray-600 hover:text-red-600"
                        aria-label={`Remove photo ${index + 1}`}
                      ><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">{files.length} of {max} live photos captured</p>
                {!disabled && roomLeft > 0 && (
                  <button type="button" onClick={() => { setLocalError(''); setCameraOpen(true); }} className="btn-secondary btn-sm">
                    <Camera size={14} /> Capture another
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {(localError || error) && <p role="alert" className="text-xs text-red-600">{localError || error}</p>}
    </div>
  );
}
