/**
 * Notification derivation.
 *
 * LabTrack has no `notifications` collection: every notification here is
 * *derived* from the collections that already exist (requests, labBookings,
 * warnings, penalties). That keeps the data model small and means notifications
 * work retroactively — a request approved last term still raises the right
 * notification today.
 *
 * Each notification carries the route it belongs to, so the panel can send the
 * user straight to the thing the notification is about. Pages that already
 * understand a query parameter are deep-linked to the exact record
 * (e.g. `/admin/borrowing?id=…&action=return`); the rest go to their section.
 *
 * Read state is a single watermark (`users/{uid}.notifSeenAt`) rather than a
 * per-item flag, so it costs one field and never grows.
 */

import { getTodayManila, formatDate, getEquipmentDueState } from './helpers';

/** Anything at or before this many items back is ignored when rendering. */
export const MAX_NOTIFICATIONS = 40;

/* ── timestamps ───────────────────────────────────────────────────────────── */

/**
 * Milliseconds for a Firestore Timestamp, Date, epoch number or
 * `YYYY-MM-DD` string (date-only values fall back to local midnight).
 * @returns {number} 0 when the value is unusable.
 */
export function msOf(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/* ── shared text helpers ──────────────────────────────────────────────────── */

function truncate(text, max = 70) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function itemSummary(request, max = 60) {
  const items = request?.items || [];
  if (!items.length) return truncate(request?.experiment || 'Equipment');
  const text = items
    .map(i => `${i.name} × ${i.qtyReleased || i.qtyRequested || 1}`)
    .join(', ');
  return truncate(text, max);
}

function studentLine(entity) {
  if (!entity) return '';
  const who = entity.borrowerName || entity.studentName || 'Student';
  const grade = entity.gradeLevel && entity.section
    ? ` · ${entity.gradeLevel} - ${entity.section}`
    : entity.section ? ` · ${entity.section}` : '';
  return `${who}${grade}`;
}

function bookingWhen(booking) {
  const date = booking.bookingDate ? formatDate(booking.bookingDate) : '';
  const time = [booking.startTime, booking.endTime].filter(Boolean).join('–');
  return [date, time].filter(Boolean).join(' · ');
}

const SEVERITY_TONE = { critical: 'danger', major: 'warning', warning: 'caution' };

/**
 * Order newest first and drop anything unrenderable.
 * @param {Array<object>} items
 */
function finish(items) {
  return items
    .filter(n => n && n.at)
    .sort((a, b) => msOf(b.at) - msOf(a.at))
    .slice(0, MAX_NOTIFICATIONS);
}

/* ── students ─────────────────────────────────────────────────────────────── */

/**
 * Notifications for a student: what the laboratory decided, what they must do
 * next, and anything recorded against their account.
 *
 * @param {{requests?: object[], bookings?: object[], warnings?: object[], penalties?: object[]}} data
 */
export function buildStudentNotifications(data = {}, now = Date.now()) {
  const {
    requests = [], bookings = [], warnings = [], penalties = [],
  } = data || {};
  const items = [];

  for (const r of requests) {
    const base = {
      scope: 'request',
      refId: r.id,
      meta: studentLine(r),
      experiment: r.experiment,
    };

    switch (r.status) {
      case 'approved':
        items.push({
          ...base,
          id: `request-${r.id}-approved`,
          kind: 'approved',
          tone: 'action',
          title: 'Request approved — ready for collection',
          body: `Your request for “${truncate(r.experiment, 40)}” was approved. ${itemSummary(r, 50)} is waiting at the laboratory.`,
          to: `/requests/${r.id}`,
          action: 'View request',
          at: r.approvedAt,
        });
        break;

      case 'rejected':
        items.push({
          ...base,
          id: `request-${r.id}-rejected`,
          kind: 'rejected',
          tone: 'danger',
          title: 'Request rejected',
          body: r.staffRemarks
            ? `“${truncate(r.experiment, 40)}” was declined — ${truncate(r.staffRemarks, 90)}`
            : `“${truncate(r.experiment, 40)}” was declined by the laboratory staff.`,
          to: `/requests/${r.id}`,
          action: 'See the reason',
          at: r.updatedAt || r.createdAt,
        });
        break;

      case 'borrowed':
        items.push({
          ...base,
          id: `request-${r.id}-borrowed`,
          kind: 'borrowed',
          tone: 'info',
          title: 'Equipment released to you',
          body: `${itemSummary(r, 60)} was released. Return it on ${formatDate(r.expectedReturnDate)}.`,
          to: `/requests/${r.id}`,
          action: 'View request',
          at: r.releasedAt || r.releaseDate,
        });
        break;

      case 'return_submitted':
        items.push({
          ...base,
          id: `request-${r.id}-proof`,
          kind: 'proof_pending',
          tone: 'info',
          title: 'Return proof under review',
          body: 'Your proof photo was received and is waiting for the laboratory staff to check it.',
          to: `/requests/${r.id}`,
          action: 'View request',
          at: r.returnSubmittedAt,
        });
        break;

      case 'return_flagged':
        items.push({
          ...base,
          id: `request-${r.id}-flagged`,
          kind: 'flagged',
          tone: 'danger',
          title: 'Return proof rejected — please resubmit',
          body: r.returnReview?.remarks
            ? `Clean or repair the equipment and send a new photo — ${truncate(r.returnReview.remarks, 90)}`
            : 'Clean or repair the equipment and send a new photo of it.',
          to: `/requests/${r.id}`,
          action: 'Fix and resubmit',
          at: r.returnReview?.reviewedAt || r.returnSubmittedAt,
        });
        break;

      case 'returned':
        items.push({
          ...base,
          id: `request-${r.id}-returned`,
          kind: 'returned',
          tone: 'positive',
          title: 'Return completed',
          body: `“${truncate(r.experiment, 40)}” was received${r.returnReview?.verdict === 'clean' ? ' and marked clean' : ''}. Thank you.`,
          to: `/requests/${r.id}`,
          action: 'View request',
          at: r.returnedAt,
        });
        break;

      default:
        break; // `pending` needs no notification — the student just submitted it.
    }

    const dueState = getEquipmentDueState(r.status, r.expectedReturnDate, r.expectedReturnTime, now);
    if (dueState) {
      const dueLabel = `${formatDate(r.expectedReturnDate)}${r.expectedReturnTime ? ` by ${r.expectedReturnTime}` : ''}`;
      items.push({
        ...base,
        id: `request-${r.id}-${dueState.kind}-${r.expectedReturnDate}-${r.expectedReturnTime || ''}`,
        kind: dueState.kind,
        tone: dueState.kind === 'overdue' ? 'danger' : 'warning',
        title: dueState.kind === 'overdue' ? 'Equipment return is overdue' : 'Equipment return due within 24 hours',
        body: dueState.kind === 'overdue'
          ? `${itemSummary(r, 60)} was due ${dueLabel}. Return it or contact laboratory staff.`
          : `${itemSummary(r, 60)} is due ${dueLabel}. Submit the return photo after handing it in.`,
        to: `/requests/${r.id}`,
        action: 'View return details',
        at: dueState.kind === 'overdue' ? dueState.deadline : dueState.deadline - 24 * 60 * 60 * 1000,
      });
    }
  }

  for (const b of bookings) {
    const base = {
      scope: 'labBooking',
      refId: b.id,
      meta: [b.labRoom, bookingWhen(b)].filter(Boolean).join(' · '),
    };
    const to = `/my-lab-bookings?booking=${b.id}`;

    switch (b.status) {
      case 'approved':
        items.push({
          ...base,
          id: `booking-${b.id}-approved`,
          kind: 'booking_approved',
          tone: 'positive',
          title: 'Laboratory booking approved',
          body: `${b.labRoom || 'The laboratory'} on ${bookingWhen(b)} is reserved for you.`,
          to,
          action: 'View booking',
          at: b.approvedAt,
        });
        break;

      case 'rejected':
        items.push({
          ...base,
          id: `booking-${b.id}-rejected`,
          kind: 'booking_rejected',
          tone: 'danger',
          title: 'Laboratory booking rejected',
          body: b.staffRemarks
            ? `${b.labRoom || 'The laboratory'} on ${bookingWhen(b)} was declined — ${truncate(b.staffRemarks, 90)}`
            : `${b.labRoom || 'The laboratory'} on ${bookingWhen(b)} was declined.`,
          to,
          action: 'See the reason',
          at: b.rejectedAt,
        });
        break;

      case 'cancelled':
        items.push({
          ...base,
          id: `booking-${b.id}-cancelled`,
          kind: 'booking_cancelled',
          tone: 'warning',
          title: b.cancellationReason === 'no_show' ? 'Laboratory booking marked no-show' : 'Laboratory booking cancelled',
          body: b.cancellationReason === 'no_show'
            ? `${b.labRoom || 'The laboratory'} on ${bookingWhen(b)} ended without a recorded check-in and was released.`
            : `${b.labRoom || 'The laboratory'} on ${bookingWhen(b)} was cancelled.`,
          to,
          action: 'View booking',
          at: b.cancelledAt,
        });
        break;

      case 'completed':
        items.push({
          ...base,
          id: `booking-${b.id}-completed`,
          kind: 'booking_completed',
          tone: 'positive',
          title: 'Laboratory booking completed',
          body: `${b.labRoom || 'The laboratory'} on ${bookingWhen(b)} was marked as done.`,
          to,
          action: 'View booking',
          at: b.returnedAt,
        });
        break;

      default:
        break; // `pending` needs no notification.
    }
  }

  for (const w of warnings) {
    if (w.resolved) continue; // Nothing to act on any more.
    items.push({
      id: `warning-${w.id}`,
      scope: 'warning',
      refId: w.id,
      kind: 'warning',
      tone: SEVERITY_TONE[w.severity] || 'caution',
      title: 'Account warning issued',
      body: w.message || 'The laboratory staff recorded a warning on your account.',
      meta: w.issuedByName ? `Issued by ${w.issuedByName}` : '',
      to: w.requestId
        ? `/requests/${w.requestId}`
        : w.labBookingId ? '/my-lab-bookings' : '/my-requests',
      action: 'View details',
      at: w.issuedAt,
    });
  }

  for (const p of penalties) {
    items.push({
      id: `penalty-${p.id}`,
      scope: 'penalty',
      refId: p.id,
      kind: 'penalty',
      tone: 'danger',
      title: 'Penalty recorded on your account',
      body: truncate(
        [p.violationType, p.consequence].filter(Boolean).join(' — ') || 'See the details of this penalty.',
        110,
      ),
      meta: studentLine(p),
      to: '/rules',
      action: 'View penalties',
      at: p.dateRecorded,
    });
  }

  return finish(items);
}

/* ── laboratory staff ─────────────────────────────────────────────────────── */

/**
 * Notifications for an administrator: the queue that needs staff action, plus
 * items that went quiet and would otherwise go unnoticed.
 *
 * Each source arrives pre-filtered by the query that feeds it, so no index is
 * needed beyond single-field equality.
 *
 * @param {{
 *   pendingRequests?: object[],
 *   returnProofs?: object[],
 *   overdueReturns?: object[],
 *   flaggedReturns?: object[],
 *   pendingBookings?: object[],
 *   today?: string,
 * }} data
 */
export function buildAdminNotifications(data = {}, now = Date.now()) {
  const {
    pendingRequests = [],
    returnProofs = [],
    overdueReturns = [],
    flaggedReturns = [],
    pendingBookings = [],
    today = getTodayManila(),
  } = data || {};
  const items = [];

  for (const r of pendingRequests) {
    items.push({
      id: `request-${r.id}-pending`,
      scope: 'request',
      refId: r.id,
      kind: 'request_pending',
      tone: 'action',
      title: 'New equipment request',
      body: `${studentLine(r)} · ${truncate(r.experiment, 40)} · ${itemSummary(r, 50)}`,
      meta: `Submitted ${formatDate(r.requestDate)}`,
      to: '/admin/requests',
      action: 'Review requests',
      at: r.createdAt,
    });
  }

  for (const r of returnProofs) {
    items.push({
      id: `request-${r.id}-proof`,
      scope: 'request',
      refId: r.id,
      kind: 'return_proof',
      tone: 'action',
      title: 'Return proof to assess',
      body: `${studentLine(r)} · ${truncate(r.experiment, 40)} · attempt #${(r.returnAttempt || 0) + 1}`,
      meta: r.proposedReturnDate ? `Student returned it on ${formatDate(r.proposedReturnDate)}` : '',
      to: `/admin/borrowing?id=${r.id}&action=return`,
      action: 'Assess the photo',
      at: r.returnSubmittedAt,
    });
  }

  for (const r of overdueReturns) {
    const dueState = getEquipmentDueState(r.status, r.expectedReturnDate, r.expectedReturnTime, now);
    if (!dueState) continue;
    const daysLate = Math.max(0, Math.ceil((now - dueState.deadline) / 86400000));
    items.push({
      id: `request-${r.id}-overdue`,
      scope: 'request',
      refId: r.id,
      kind: 'overdue',
      tone: 'danger',
      title: dueState.kind === 'due_soon' ? 'Equipment return due within 24 hours' : daysLate > 0 ? `Overdue by ${daysLate} day${daysLate > 1 ? 's' : ''}` : 'Equipment return overdue',
      body: `${studentLine(r)} still has ${itemSummary(r, 50)} — expected ${formatDate(r.expectedReturnDate)}${r.expectedReturnTime ? ` by ${r.expectedReturnTime}` : ''}.`,
      to: `/admin/borrowing?id=${r.id}`,
      action: 'Open in Borrowing & Returns',
      at: dueState.deadline,
    });
  }

  for (const r of flaggedReturns) {
    items.push({
      id: `request-${r.id}-flagged`,
      scope: 'request',
      refId: r.id,
      kind: 'flagged_waiting',
      tone: 'info',
      title: 'Flagged return — waiting on the student',
      body: `${studentLine(r)} must clean or repair ${truncate(r.experiment, 40)} and send a new proof photo.`,
      to: `/admin/borrowing?id=${r.id}`,
      action: 'Open in Borrowing & Returns',
      at: r.returnReview?.reviewedAt,
    });
  }

  for (const b of pendingBookings) {
    items.push({
      id: `booking-${b.id}-pending`,
      scope: 'labBooking',
      refId: b.id,
      kind: 'booking_pending',
      tone: 'action',
      title: 'New laboratory booking',
      body: `${studentLine(b)} · ${b.labRoom || 'Laboratory'} · ${bookingWhen(b)}`,
      meta: b.purpose ? truncate(b.purpose, 70) : '',
      to: `/admin/lab-bookings?id=${b.id}`,
      action: 'Review the booking',
      at: b.createdAt || b.submittedAt,
    });
  }

  return finish(items);
}

/* ── read state + sidebar counts ──────────────────────────────────────────── */

/**
 * Watermark for "read": anything at or before it has been seen.
 * @param {object} notification
 * @param {number} seenAt
 */
export function isUnread(notification, seenAt) {
  return msOf(notification?.at) > (seenAt || 0);
}

/**
 * Sidebar badge counts, keyed the same way `Layout.jsx` expects.
 * These stay "how many need attention", not "how many unread", so the sidebar
 * does not lose an alert just because the bell was opened.
 *
 * @param {{isAdmin: boolean, data: object}} args
 */
export function buildCounts({ isAdmin, data = {} }) {
  const { requests = [], bookings = [], pendingRequests = [], returnProofs = [], pendingBookings = [] } = data || {};

  if (isAdmin) {
    return {
      pendingRequests: pendingRequests.length,
      returnProofs: returnProofs.length,
      labBookings: pendingBookings.length,
    };
  }

  return {
    toCollect: requests.filter(r => r.status === 'approved').length,
    returnAction: requests.filter(r => r.status === 'return_flagged').length,
    labAction: bookings.filter(
      b => b.status === 'approved' || b.status === 'cancelled',
    ).length,
  };
}
