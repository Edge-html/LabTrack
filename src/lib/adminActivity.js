import { collection, doc, serverTimestamp } from 'firebase/firestore';

/** Add an immutable audit entry to an existing batch or transaction. */
export function addAdminActivity(writer, db, userProfile, {
  action, entityType, entityId, summary, metadata = {},
}) {
  const ref = doc(collection(db, 'adminActivity'));
  writer.set(ref, {
    actorUid: userProfile?.uid || '',
    actorName: userProfile?.name || 'Laboratory Admin',
    action,
    entityType,
    entityId: String(entityId || ''),
    summary: String(summary || '').slice(0, 240),
    metadata,
    at: serverTimestamp(),
  });
  return ref;
}
