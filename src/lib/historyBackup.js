import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { downloadJson } from './csv';

async function requestRecordBundle(db, request) {
  const [proof, reservations] = await Promise.all([
    getDoc(doc(db, 'requestProofs', request.id)),
    getDocs(query(collection(db, 'equipmentReservations'), where('requestId', '==', request.id))),
  ]);
  return {
    request,
    returnProof: proof.exists() ? proof.data() : null,
    reservations: reservations.docs.map(item => ({ id: item.id, ...item.data() })),
  };
}

export async function downloadRequestHistoryBackup(db, requests, filename) {
  const records = [];
  for (let offset = 0; offset < requests.length; offset += 20) {
    records.push(...await Promise.all(requests.slice(offset, offset + 20).map(request => requestRecordBundle(db, request))));
  }
  downloadJson(filename, { format: 'LabTrack equipment history backup v1', exportedAt: new Date().toISOString(), records });
}

export async function downloadLabBookingHistoryBackup(db, bookings, filename) {
  const calendarEntries = await Promise.all(bookings.map(async booking => {
    const snap = await getDoc(doc(db, 'labBookingCalendar', booking.id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }));
  downloadJson(filename, {
    format: 'LabTrack laboratory booking backup v1',
    exportedAt: new Date().toISOString(),
    bookings,
    calendarEntries: calendarEntries.filter(Boolean),
  });
}
