import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { LAB_ROOMS } from '../lib/helpers';

/** Shared, admin-configurable list of bookable laboratory rooms. */
export function useLabRooms() {
  const [rooms, setRooms] = useState(LAB_ROOMS);
  const [loadingRooms, setLoadingRooms] = useState(true);

  useEffect(() => {
    let active = true;
    getDoc(doc(db, 'settings', 'labRooms'))
      .then(snap => {
        if (!active || !snap.exists()) return;
        const names = snap.data().list;
        if (Array.isArray(names) && names.length) {
          const normalized = [...new Set(names.map(name => String(name).trim()).filter(Boolean))];
          if (normalized.length) setRooms(normalized.map(id => ({ id })));
        }
      })
      .catch(err => console.error('Failed to load laboratory rooms:', err))
      .finally(() => { if (active) setLoadingRooms(false); });
    return () => { active = false; };
  }, []);

  return { rooms, loadingRooms };
}
