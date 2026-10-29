import React from 'react';
import { Clock, Calendar, DoorOpen } from 'lucide-react';
import { formatTimestamp } from '../lib/helpers';

/**
 * Shows the four timestamps that make up a laboratory booking's audit trail:
 * requested → approved → occupied → done.
 */
export default function BookingTimeline({ booking }) {
  const steps = [
    { label: 'Request Sent', at: booking.submittedAt || booking.createdAt },
    { label: 'Approved', at: booking.approvedAt },
    { label: 'Occupied', at: booking.checkedInAt },
    { label: 'Done', at: booking.returnedAt },
  ];

  const nextStep = booking.status === 'pending'
    ? 'Waiting for laboratory staff to review this booking.'
    : booking.status === 'approved' && !booking.checkedInAt
      ? 'Arrive on time. Staff will mark the room occupied when you check in.'
      : booking.checkedInAt && booking.status !== 'completed'
        ? 'The room is occupied. Staff will mark it done when you finish.'
        : booking.status === 'completed'
          ? 'This laboratory booking is complete.'
          : booking.status === 'rejected'
            ? `This booking was declined${booking.staffRemarks ? `: ${booking.staffRemarks}` : '.'}`
            : booking.cancellationReason === 'no_show'
              ? 'This booking was marked as a no-show and the room slot was released.'
              : booking.status === 'cancelled'
                ? 'This booking was cancelled and the room slot was released.'
                : 'Check the booking status or contact laboratory staff for the next step.';

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="Laboratory booking progress">
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
      <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
        <span className="font-semibold">Next step:</span> {nextStep}
      </p>
    </div>
  );
}
