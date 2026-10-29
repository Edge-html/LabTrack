import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query, startAfter } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatTimestamp, timeAgo } from '../../lib/helpers';
import { useToast } from '../../context/ToastContext';

const PAGE_SIZE = 100;

export default function AdminActivity() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(reset = true) {
    setLoading(true);
    try {
      const constraints = [orderBy('at', 'desc')];
      if (!reset && cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(collection(db, 'adminActivity'), ...constraints));
      const page = snap.docs.map(item => ({ id: item.id, ...item.data() }));
      setRows(current => reset ? page : [...current, ...page]);
      setCursor(snap.docs.at(-1) || null);
      setHasMore(snap.size === PAGE_SIZE);
    } catch (error) {
      console.error('Could not load admin activity:', error);
      toast.error('Could not load the admin activity log. Deploy the latest Firestore rules and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="card">
        <div className="card-header">
          <Activity size={18} /> Admin Activity Log
          <button type="button" onClick={() => load()} disabled={loading} className="ml-auto btn-secondary btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {rows.map(row => (
            <article key={row.id} className="p-4 flex flex-wrap gap-x-4 gap-y-1 items-start">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-gray-900">{row.summary || `${row.action} ${row.entityType}`}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {row.actorName || 'Admin'} · {row.action} · {row.entityType} {row.entityId ? `· ${row.entityId}` : ''}
                </p>
              </div>
              <time className="text-xs text-gray-500" dateTime={row.at?.toDate?.()?.toISOString?.()} title={formatTimestamp(row.at)}>
                {timeAgo(row.at)}
              </time>
            </article>
          ))}
          {!loading && rows.length === 0 && <p className="p-8 text-center text-sm text-gray-500">No admin actions have been recorded yet.</p>}
        </div>
        {hasMore && (
          <div className="p-4 border-t border-gray-100 text-center">
            <button type="button" onClick={() => load(false)} disabled={loading} className="btn-secondary btn-sm">
              {loading ? 'Loading…' : 'Load more activity'}
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 px-1">Activity records are append-only and visible to administrators only.</p>
    </div>
  );
}
