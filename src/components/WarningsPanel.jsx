import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Clock3, Package, FileText, ChevronRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { formatTimestamp } from '../lib/helpers';
import { CardSkeleton } from './LoadingSpinner';

export const WARNING_SEVERITY = {
  warning: { label: 'Warning', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  major: { label: 'Major Warning', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-800 border-red-300' },
};

export const WARNING_TYPES = [
  'not_returned',
  'damaged_equipment',
  'not_cleaned',
  'lost_equipment',
  'late_return',
  'lab_booking',
  'other',
];

export const WARNING_TYPE_LABELS = {
  not_returned: 'Did not return equipment',
  damaged_equipment: 'Damaged equipment',
  not_cleaned: 'Equipment not cleaned',
  lost_equipment: 'Lost equipment',
  late_return: 'Late return',
  lab_booking: 'Laboratory booking issue',
  other: 'Other',
};

const TYPE_ICONS = {
  not_returned: AlertOctagon,
  damaged_equipment: Package,
  not_cleaned: Package,
  lost_equipment: Package,
  late_return: Clock3,
  lab_booking: FileText,
  other: AlertTriangle,
};

export function warningTypeLabel(type) {
  return WARNING_TYPE_LABELS[type] || 'Other';
}

/**
 * Load warnings recorded against an account.
 *
 * Filters on `resolved` client-side — a compound (userId + resolved) query
 * would require a Firestore composite index, and the result set is small.
 *
 * @param {string|null} userId
 * @param {{ showResolved?: boolean }} options
 */
export function useWarnings(userId, { showResolved = false } = {}) {
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setWarnings([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'warnings'), where('userId', '==', userId)));
        if (cancelled) return;
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        all.sort((a, b) => toMillis(b.issuedAt) - toMillis(a.issuedAt));
        setWarnings(showResolved ? all : all.filter(w => !w.resolved));
      } catch (err) {
        console.error('Failed to load warnings:', err);
        if (!cancelled) setWarnings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, showResolved]);

  return { warnings, loading };
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function WarningRow({ warning }) {
  const sev = WARNING_SEVERITY[warning.severity] || WARNING_SEVERITY.warning;
  const Icon = TYPE_ICONS[warning.type] || AlertTriangle;
  const isResolved = !!warning.resolved;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border ${
        isResolved ? 'bg-gray-50 border-gray-200' : 'bg-red-50/60 border-red-200'
      }`}
    >
      <div className={`p-2 rounded-lg shrink-0 ${isResolved ? 'bg-gray-200 text-gray-500' : 'bg-red-100 text-red-600'}`}>
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sev.cls}`}>
            {sev.label}
          </span>
          {warning.requestId && (
            <Link
              to={`/requests/${warning.requestId}`}
              className="text-[11px] text-crimson hover:text-gold font-medium inline-flex items-center gap-0.5"
            >
              View related request <ChevronRight size={11} />
            </Link>
          )}
          {warning.labBookingId && (
            <Link
              to="/my-lab-bookings"
              className="text-[11px] text-crimson hover:text-gold font-medium inline-flex items-center gap-0.5"
            >
              View lab bookings <ChevronRight size={11} />
            </Link>
          )}
          {isResolved && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
              Resolved
            </span>
          )}
        </div>
        <p className="text-sm text-gray-800 mt-1 font-medium">{warningTypeLabel(warning.type)}</p>
        {warning.message && <p className="text-sm text-gray-600 mt-0.5">{warning.message}</p>}
        <p className="text-xs text-gray-400 mt-1.5">
          Issued {formatTimestamp(warning.issuedAt)}
          {warning.issuedByName ? ` by ${warning.issuedByName}` : ''}
          {isResolved && warning.resolvedAt ? ` · resolved ${formatTimestamp(warning.resolvedAt)}` : ''}
        </p>
        {isResolved && warning.resolutionNote && (
          <p className="text-xs text-green-700 mt-1">Resolution: {warning.resolutionNote}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Card wrapper listing a student's active warnings. Renders nothing when the
 * student has no warnings, so it can be dropped into any page safely.
 */
export default function WarningsPanel({ userId, showResolved = false, limitCount = 20, header = 'My Warnings' }) {
  const { warnings, loading } = useWarnings(userId, { showResolved });

  if (loading) {
    return (
      <div className="card">
        <div className="card-header"><AlertOctagon size={18} strokeWidth={1.8} /> {header}</div>
        <div className="p-4"><div className="skeleton h-16 rounded" /></div>
      </div>
    );
  }

  if (warnings.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header bg-red-700">
        <AlertOctagon size={18} strokeWidth={1.8} />
        {header}
        <span className="ml-auto text-xs font-semibold text-white/90">
          {warnings.length} active
        </span>
      </div>
      <div className="p-3 space-y-2">
        {warnings.slice(0, limitCount).map(w => (
          <WarningRow key={w.id} warning={w} />
        ))}
      </div>
    </div>
  );
}