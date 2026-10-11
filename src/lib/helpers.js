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
 * Overdue = (status is 'borrowed' or 'approved') AND expectedReturnDate < today.
 */
export function isOverdue(status, expectedReturnDate) {
  if (!expectedReturnDate) return false;
  if (status !== 'borrowed' && status !== 'approved') return false;
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
  returned: 'Returned',
  overdue: 'Overdue',
};
