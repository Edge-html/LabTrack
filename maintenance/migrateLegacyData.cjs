const { cert, initializeApp } = require('firebase-admin/app');
const { FieldPath, FieldValue, getFirestore } = require('firebase-admin/firestore');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON GitHub Actions secret.');
}

initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
const db = getFirestore();
const PAGE_SIZE = 200;

function calendarEntry(booking) {
  return {
    bookingDate: booking.bookingDate,
    labRoom: booking.labRoom,
    startTime: booking.startTime,
    endTime: booking.endTime,
    status: booking.status,
  };
}

function normalizePhotos(proof) {
  if (Array.isArray(proof?.photos) && proof.photos.length) {
    return proof.photos.filter(photo => photo?.dataUrl);
  }
  return proof?.dataUrl ? [proof] : [];
}

async function forEachPage(collectionRef, callback) {
  let cursor = null;
  while (true) {
    let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    if (page.empty) break;
    for (const snapshot of page.docs) await callback(snapshot);
    cursor = page.docs[page.docs.length - 1];
    if (page.size < PAGE_SIZE) break;
  }
}

async function migrateBookingCalendar() {
  let created = 0;
  await forEachPage(db.collection('labBookings'), async bookingSnapshot => {
    const bookingRef = bookingSnapshot.ref;
    const calendarRef = db.collection('labBookingCalendar').doc(bookingSnapshot.id);
    const wasCreated = await db.runTransaction(async transaction => {
      const [booking, calendar] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(calendarRef),
      ]);
      if (!booking.exists || calendar.exists) return false;
      transaction.create(calendarRef, calendarEntry(booking.data()));
      return true;
    });
    if (wasCreated) created += 1;
  });
  console.log(`Created ${created} sanitized laboratory calendar entr${created === 1 ? 'y' : 'ies'}.`);
}

async function migrateReturnProofs() {
  let migrated = 0;
  let skippedWithoutPhotos = 0;

  await forEachPage(db.collection('requests'), async requestSnapshot => {
    const requestRef = requestSnapshot.ref;
    const proofRef = db.collection('requestProofs').doc(requestSnapshot.id);
    const result = await db.runTransaction(async transaction => {
      const [requestSnap, proofSnap] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(proofRef),
      ]);
      if (!requestSnap.exists) return 'skipped';
      const request = requestSnap.data();
      const legacyProof = request.returnProof;
      if (!legacyProof) return 'skipped';

      const sourceProof = proofSnap.exists ? proofSnap.data() : legacyProof;
      const photos = normalizePhotos(sourceProof);
      if (!photos.length) {
        transaction.update(requestRef, { returnProof: FieldValue.delete() });
        return 'empty';
      }

      const first = photos[0];
      const size = photos.reduce((sum, photo) => sum + Number(photo.size || 0), 0);
      const metadata = {
        count: photos.length,
        size,
        width: Number(first.width || 0),
        height: Number(first.height || 0),
      };

      if (!proofSnap.exists) {
        transaction.create(proofRef, {
          userId: request.userId,
          contentType: first.contentType || 'image/jpeg',
          size,
          width: metadata.width,
          height: metadata.height,
          count: photos.length,
          photos,
          capturedAt: legacyProof.capturedAt || request.returnSubmittedAt || FieldValue.serverTimestamp(),
          attempt: Number(request.returnAttempt || legacyProof.attempt || 1),
        });
      }

      transaction.update(requestRef, {
        returnProof: FieldValue.delete(),
        returnProofMeta: metadata,
      });
      return 'migrated';
    });

    if (result === 'migrated') migrated += 1;
    if (result === 'empty') skippedWithoutPhotos += 1;
  });

  console.log(`Moved ${migrated} embedded return proof(s) to requestProofs.`);
  if (skippedWithoutPhotos) {
    console.log(`Removed ${skippedWithoutPhotos} empty legacy proof field(s).`);
  }
}

async function main() {
  await migrateBookingCalendar();
  await migrateReturnProofs();
  console.log('Legacy data migration completed.');
}

main().catch(error => {
  console.error('LabTrack data migration failed:', error);
  process.exitCode = 1;
});
