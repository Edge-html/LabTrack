import React from 'react';
import { getDisplayStatus } from '../lib/helpers';
import { AlertTriangle } from 'lucide-react';

const STATUS_CONFIG = {
  pending: { label: 'Pending', className: 'badge-pending' },
  approved: { label: 'Approved', className: 'badge-approved' },
  rejected: { label: 'Rejected', className: 'badge-rejected' },
  borrowed: { label: 'Borrowed', className: 'badge-borrowed' },
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

export function ConditionBadge({ condition }) {
  const map = {
    'Good': 'bg-green-100 text-green-700',
    'Needs Cleaning': 'bg-amber-100 text-amber-700',
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
