import React, { useEffect, useState } from 'react';
import { Download, ShieldAlert, Trash2 } from 'lucide-react';

export default function DeleteWithBackupDialog({
  isOpen, title, message, onDownload, onConfirm, onCancel, deleting = false,
}) {
  const [backupReady, setBackupReady] = useState(false);
  const [backupError, setBackupError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setBackupReady(false);
      setBackupError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function downloadBackup() {
    setBackupError('');
    try {
      await onDownload();
      setBackupReady(true);
    } catch (error) {
      setBackupError(error?.message || 'Could not create the backup.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close dialog" onClick={onCancel} disabled={deleting} />
      <section role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title" className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 id="backup-dialog-title" className="font-semibold text-gray-900 flex items-center gap-2">
          <ShieldAlert size={18} className="text-amber-600" /> {title}
        </h2>
        <p className="text-sm text-gray-600 mt-2">{message}</p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Download a JSON backup before deleting. It includes the selected records and their linked schedule or return-proof data where available.
        </div>
        {backupError && <p role="alert" className="mt-3 text-sm text-red-700">{backupError}</p>}
        {backupReady && <p role="status" className="mt-3 text-sm text-green-700">Backup downloaded. You can now continue with deletion.</p>}
        <div className="flex flex-wrap justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} disabled={deleting} className="btn-secondary btn-sm">Cancel</button>
          <button type="button" onClick={downloadBackup} disabled={deleting} className="btn-secondary btn-sm">
            <Download size={14} /> {backupReady ? 'Download backup again' : 'Download backup'}
          </button>
          <button type="button" onClick={onConfirm} disabled={!backupReady || deleting} className="btn-danger btn-sm">
            <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </section>
    </div>
  );
}
