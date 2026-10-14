/**
 * Get today's date in Asia/Manila timezone as a 'YYYY-MM-DD' string.
 */
export function getTodayManila() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/**
 * Format a 'YYYY-MM-DD' date string for display (e.g. "Oct 12, 2026").
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Count school days (Mon–Fri) between two 'YYYY-MM-DD' strings.
 */
export function countSchoolDays(fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T00:00:00');
  let count = 0;
  const cur = new Date(from);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * Add N calendar days to a 'YYYY-MM-DD' string.
 */
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/**
 * Add N school days (Mon-Fri) to a 'YYYY-MM-DD' string.
 */
export function addSchoolDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toLocaleDateString('en-CA');
}

/**
 * Map a duration dropdown value to number of days.
 */
export function durationToDays(duration) {
  switch (duration) {
    case '1 day': return 1;
    case '2 days': return 2;
    case '3 days': return 3;
    case '1 week': return 7;
    default: return null;
  }
}

/**
 * Determine if a request is overdue in the UI.
 * Overdue = equipment is still out (approved / borrowed / return_submitted /
 * return_flagged) AND expectedReturnDate < today.
 */
export function isOverdue(status, expectedReturnDate) {
  if (!expectedReturnDate) return false;
  if (!['borrowed', 'approved', 'return_submitted', 'return_flagged'].includes(status)) return false;
  const today = getTodayManila();
  return expectedReturnDate < today;
}

/**
 * Get the display status (adds 'overdue' as a derived state).
 */
export function getDisplayStatus(status, expectedReturnDate) {
  if (isOverdue(status, expectedReturnDate)) return 'overdue';
  return status;
}

/**
 * Translate a Firebase Auth error code to a user-friendly message.
 */
export function authErrorMessage(code) {
  const map = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not enabled. Please enable it in your Firebase Console under Authentication > Sign-in method.',
    'permission-denied': 'You do not have permission to perform this action.',
  };
  return map[code] || 'An unexpected error occurred. Please try again.';
}

/**
 * Parse a Firestore or Firebase error into a message string.
 */
export function parseFirebaseError(error) {
  if (!error) return 'An unexpected error occurred.';
  return authErrorMessage(error.code) || error.message || 'An unexpected error occurred.';
}

/**
 * Only Grade 11 and Grade 12 students use the laboratory.
 */
export const GRADE_LEVELS = ['Grade 11', 'Grade 12'];

/**
 * Validate that a grade level is 11 or 12.
 */
export function isValidGradeLevel(grade) {
  if (!grade) return false;
  const str = String(grade).trim();
  return str === 'Grade 11' || str === 'Grade 12' || str === '11' || str === '12';
}

export const DURATION_OPTIONS = ['1 day', '2 days', '3 days', '1 week', 'Custom'];

export const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  borrowed: 'Borrowed',
  return_submitted: 'Awaiting Check',
  return_flagged: 'Action Required',
  returned: 'Returned',
  overdue: 'Overdue',
};

/* ── Timestamps ───────────────────────────────────────────────────────────
 * Firestore stores serverTimestamp() values, which arrive as Timestamp
 * objects. These helpers normalise Timestamp | Date | ISO string | epoch ms.
 */

/**
 * Convert a Firestore Timestamp / Date / ISO string / epoch ms into a Date,
 * or null when the value is missing or unparseable.
 */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a timestamp for display, e.g. "Oct 14, 2026, 3:24 PM".
 * Pass withSeconds for audit-trail precision.
 */
export function formatTimestamp(value, { withSeconds = false } = {}) {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });
}

/**
 * Format only the clock portion of a timestamp, e.g. "3:24 PM".
 */
export function formatTime(value, { withSeconds = false } = {}) {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });
}

/**
 * Relative time from now, e.g. "5 min ago" / "in 2 hr".
 */
export function timeAgo(value) {
  const d = toDate(value);
  if (!d) return '—';
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

/* ── Laboratory rooms ─────────────────────────────────────────────────── */

export const LAB_ROOMS = [
  { id: 'Room 103' },
  { id: 'Room 301' },
];

export const LAB_ROOM_IDS = LAB_ROOMS.map((r) => r.id);

/**
 * Look up a room definition by its stored id.
 */
export function getLabRoom(id) {
  return LAB_ROOMS.find((r) => r.id === id) || null;
}

/**
 * Format a 24-hour "HH:MM" time string to a friendly "7:30 AM" label.
 */
export function formatTimeOfDay(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = String(timeStr).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Human-readable length of a booking, e.g. "1 hr 30 min".
 * Returns null when the range is missing or invalid.
 */
export function durationLabel(startTime, endTime) {
  if (!startTime || !endTime || startTime >= endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
}

/**
 * Do two half-open time ranges [aStart, aEnd) and [bStart, bEnd) overlap?
 * Used to detect laboratory room slot conflicts.
 */
export function timesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

export const LAB_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Derived status for a lab booking: an approved booking that has ended but
 * has not been signed back in by staff is treated as overdue.
 */
export function getLabDisplayStatus(booking) {
  if (!booking) return '';
  if (booking.status !== 'approved') return booking.status;
  const today = getTodayManila();
  if (booking.bookingDate && booking.bookingDate < today && !booking.returnedAt) {
    return 'overdue';
  }
  return 'approved';
}
