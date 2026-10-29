import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { formatTimestamp } from '../lib/helpers';

const STEPS = [
  { label: 'Submitted', at: request => request.createdAt || request.requestDate },
  { label: 'Approved', at: request => request.approvedAt },
  { label: 'Collected', at: request => request.releasedAt || request.releaseDate },
  { label: 'Return photo submitted', at: request => request.returnSubmittedAt },
  { label: 'Done', at: request => request.returnedAt },
];

const CURRENT_STEP = {
  pending: 1,
  approved: 2,
  borrowed: 3,
  return_submitted: 4,
  return_flagged: 4,
};

function nextAction(request, isAdmin) {
  switch (request.status) {
    case 'pending': return 'Waiting for laboratory staff to review this request.';
    case 'approved': return isAdmin ? 'The student can collect the approved equipment.' : 'Collect the equipment from the laboratory at the proposed time.';
    case 'borrowed': return isAdmin ? 'The equipment is out. Review its return when the student submits a photo.' : 'Return the equipment by the due time, then take and submit a return photo.';
    case 'return_submitted': return isAdmin ? 'Review the submitted return photo and record the equipment condition.' : 'Your return photo is submitted and waiting for staff review.';
    case 'return_flagged': return isAdmin ? 'The student needs to resolve the return issue and submit a new photo.' : 'Report to the laboratory, resolve the noted issue, and submit a new photo.';
    case 'returned': return 'This equipment request is complete.';
    case 'rejected': return request.staffRemarks ? `Request declined: ${request.staffRemarks}` : 'This request was declined. Contact laboratory staff if you need help.';
    case 'cancelled': return 'This request was cancelled.';
    default: return 'Check the current status or contact laboratory staff for the next step.';
  }
}

export default function EquipmentRequestTimeline({ request, isAdmin = false }) {
  const currentStep = CURRENT_STEP[request.status];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" aria-label="Equipment request progress">
        {STEPS.map((step, index) => {
          const at = step.at(request);
          const complete = Boolean(at);
          const current = index === currentStep && !complete;
          return (
            <div key={step.label} className={`min-w-0 rounded-xl border p-3 ${complete ? 'border-green-200 bg-green-50' : current ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center gap-1.5">
                {complete
                  ? <CheckCircle2 size={14} className="shrink-0 text-green-700" aria-hidden="true" />
                  : <Clock size={14} className={`shrink-0 ${current ? 'text-amber-700' : 'text-gray-400'}`} aria-hidden="true" />}
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-600">{step.label}</p>
              </div>
              <p className={`mt-1 text-xs ${complete ? 'font-medium text-green-800' : current ? 'font-medium text-amber-900' : 'text-gray-400'}`}>
                {complete ? formatTimestamp(at) : current ? 'In progress' : 'Not yet'}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
        <span className="font-semibold">Next step:</span> {nextAction(request, isAdmin)}
      </p>
    </div>
  );
}
