import {
  collection, doc, getDocs, query, where, writeBatch,
} from 'firebase/firestore';

export const EQUIPMENT_RESERVATION_STATUSES = ['approved', 'borrowed', 'return_submitted', 'return_flagged'];

export function reservationDocumentId(requestId, equipmentId) {
  return `${requestId}_${equipmentId}`;
}

export function reservationWindow(request) {
  const startDate = request.experimentDate;
  const endDate = request.expectedReturnDate || startDate;
  if (!startDate || !endDate) return null;
  return {
    startAt: `${startDate}T${request.proposedBorrowTime || '08:00'}`,
    endAt: `${endDate}T${request.expectedReturnTime || '12:00'}`,
  };
}

export function hasReservationOverlap(a, b) {
  return !!a && !!b && a.startAt < b.endAt && a.endAt > b.startAt;
}

function groupItems(items = []) {
  const grouped = new Map();
  items.forEach(item => {
    if (!item.equipmentId) return;
    const current = grouped.get(item.equipmentId) || { equipmentId: item.equipmentId, name: item.name, qty: 0 };
    current.qty += Number(item.qtyReleased || item.qtyApproved || item.qtyRequested || 0);
    grouped.set(item.equipmentId, current);
  });
  return [...grouped.values()];
}

/** Backfill reservations for active legacy requests before a new approval is evaluated. */
export async function ensureActiveEquipmentReservations(db) {
  const [requestSnap, reservationSnap] = await Promise.all([
    getDocs(query(collection(db, 'requests'), where('status', 'in', EQUIPMENT_RESERVATION_STATUSES))),
    getDocs(query(collection(db, 'equipmentReservations'), where('status', '==', 'active'))),
  ]);
  const existingIds = new Set(reservationSnap.docs.map(item => item.id));
  const missing = [];
  requestSnap.docs.forEach(requestDoc => {
    const request = requestDoc.data();
    const window = reservationWindow(request);
    if (!window) return;
    groupItems(request.items).forEach(item => {
      const id = reservationDocumentId(requestDoc.id, item.equipmentId);
      if (!existingIds.has(id)) missing.push({ id, requestId: requestDoc.id, ...item, ...window });
    });
  });

  for (let i = 0; i < missing.length; i += 450) {
    const batch = writeBatch(db);
    missing.slice(i, i + 450).forEach(item => batch.set(doc(db, 'equipmentReservations', item.id), {
      equipmentId: item.equipmentId,
      requestId: item.requestId,
      qty: item.qty,
      startAt: item.startAt,
      endAt: item.endAt,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await batch.commit();
  }
}
