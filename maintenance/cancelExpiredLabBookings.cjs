const { cert, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON GitHub Actions secret.');
}

const serviceAccount = JSON.parse(serviceAccountJson);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function manilaDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function hasExpired(booking, now) {
  if (booking.checkedInAt || !booking.bookingDate || !booking.endTime) return false;
  return booking.bookingDate < now.date ||
    (booking.bookingDate === now.date && booking.endTime <= now.time);
}

async function cancelExpiredLabBookings() {
  const now = manilaDateTime();
  const snapshot = await db.collection('labBookings')
    .where('status', 'in', ['pending', 'approved'])
    .where('bookingDate', '<=', now.date)
    .get();

  let cancelled = 0;
  for (const bookingDoc of snapshot.docs) {
    const didCancel = await db.runTransaction(async transaction => {
      const latest = await transaction.get(bookingDoc.ref);
      if (!latest.exists) return false;
      const booking = latest.data();
      if (!['pending', 'approved'].includes(booking.status) || !hasExpired(booking, now)) return false;
      transaction.update(bookingDoc.ref, {
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
        cancellationReason: 'Automatically cancelled because the booking time passed.',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (didCancel) cancelled += 1;
  }

  console.log(`Automatically cancelled ${cancelled} expired lab booking(s).`);
}

cancelExpiredLabBookings().catch(error => {
  console.error('Could not cancel expired lab bookings:', error);
  process.exitCode = 1;
});
