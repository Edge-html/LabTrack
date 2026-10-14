import React from 'react';
import { getDisplayStatus, getLabDisplayStatus, LAB_STATUS_LABELS } from '../lib/helpers';
import { AlertTriangle, AlertCircle, Clock3 } from 'lucide-react';

const STATUS_CONFIG = {
  pending: { label: 'Pending', className: 'badge-pending' },
  approved: { label: 'Approved', className: 'badge-approved' },
  rejected: { label: 'Rejected', className: 'badge-rejected' },
  borrowed: { label: 'Borrowed', className: 'badge-borrowed' },
  return_submitted: {
    label: 'Awaiting Check',
    className: 'badge-review',
    icon: <Clock3 size={12} />,
  },
  return_flagged: {
    label: 'Action Required',
    className: 'badge-flagged',
    icon: <AlertCircle size={12} />,
  },
  returned: { label: 'Returned', className: 'badge-returned' },
  overdue: { label: 'Overdue', className: 'badge-overdue', icon: <AlertTriangle size={12} /> },
};

export function StatusBadge({ status, expectedReturnDate }) {
  const display = getDisplayStatus(status, expectedReturnDate);
  const config = STATUS_CONFIG[display] || { label: display, className: 'badge bg-gray-100 text-gray-600' };
  return (
    <span className={config.className}>
      {config.icon ? config.icon : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 inline-block" />}
      {config.label}
    </span>
  );
}

/**
 * Lab booking status. Accepts a full booking object (or plain status string)
 * so the derived "overdue" state works without extra wiring.
 */
export function LabStatusBadge({ booking }) {
  const status = typeof booking === 'string' ? booking : getLabDisplayStatus(booking);
  const config = {
    pending: { label: LAB_STATUS_LABELS.pending, className: 'badge-pending' },
    approved: { label: LAB_STATUS_LABELS.approved, className: 'badge-approved' },
    rejected: { label: LAB_STATUS_LABELS.rejected, className: 'badge-rejected' },
    completed: { label: LAB_STATUS_LABELS.completed, className: 'badge-returned' },
    cancelled: { label: LAB_STATUS_LABELS.cancelled, className: 'bg-gray-100 text-gray-500 border border-gray-200' },
    overdue: { label: 'Not Signed Out', className: 'badge-overdue', icon: <AlertTriangle size={12} /> },
  }[status] || { label: status, className: 'badge bg-gray-100 text-gray-600' };

  return (
    <span className={config.className}>
      {config.icon ? config.icon : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 inline-block" />}
      {config.label}
    </span>
  );
}

export function ConditionBadge({ condition }) {
  const map = {
    'Good': 'bg-green-100 text-green-700',
    'Clean': 'bg-green-100 text-green-700',
    'Needs Cleaning': 'bg-amber-100 text-amber-700',
    'Not Cleaned': 'bg-amber-100 text-amber-700',
    'Needs Repair': 'bg-orange-100 text-orange-700',
    'Damaged': 'bg-red-100 text-red-700',
    'Out of Service': 'bg-gray-200 text-gray-600',
  };
  const cls = map[condition] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 inline-block" />
      {condition || '—'}
    </span>
  );
}