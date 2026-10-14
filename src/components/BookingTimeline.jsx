import React from 'react';
import { Clock, Calendar, DoorOpen } from 'lucide-react';
import { formatTimestamp } from '../lib/helpers';

/**
 * Shows the four timestamps that make up a laboratory booking's audit trail:
 * requested → approved → room used → room returned.
 */
export default function BookingTimeline({ booking }) {
  const steps = [
    { label: 'Request Sent', at: booking.submittedAt || booking.createdAt },
    { label: 'Approved', at: booking.approvedAt },
    { label: 'Room Used', at: booking.checkedInAt },
    { label: 'Room Returned', at: booking.returnedAt },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {steps.map(s => (
        <div
          key={s.label}
          className={`p-3 rounded-xl border text-center ${
            s.at ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{s.label}</p>
          <p className={`text-xs font-semibold mt-1 ${s.at ? 'text-green-800' : 'text-gray-400'}`}>
            {s.at ? formatTimestamp(s.at) : 'Pending'}
          </p>
        </div>
      ))}
    </div>
  );
}