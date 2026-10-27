const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

initializeApp();
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

/** Cancel unstarted room reservations after their booked end time (Manila time). */
exports.cancelExpiredLabBookings = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Manila',
  region: 'asia-southeast1',
}, async () => {
  const now = manilaDateTime();
  const snapshot = await db.collection('labBookings')
    .where('status', 'in', ['pending', 'approved'])
    .where('bookingDate', '<=', now.date)
    .get();

  const expired = snapshot.docs.filter(doc => {
    const booking = doc.data();
    if (booking.checkedInAt || !booking.bookingDate || !booking.endTime) return false;
    return booking.bookingDate < now.date ||
      (booking.bookingDate === now.date && booking.endTime <= now.time);
  });

  for (let i = 0; i < expired.length; i += 450) {
    const batch = db.batch();
    expired.slice(i, i + 450).forEach(doc => batch.update(doc.ref, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancellationReason: 'Automatically cancelled because the booking time passed.',
      updatedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
  }
  console.log(`Automatically cancelled ${expired.length} expired lab booking(s).`);
});
