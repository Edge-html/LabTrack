import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Clock,
  CheckCircle2, Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import {
  getTodayManila, addDays, formatDate, formatTimeOfDay,
  toTimeString, mergeTimeRanges, freeWindows,
  LAB_ROOMS, isValidGradeLevel,
} from '../lib/helpers';
import { PageLoader } from '../components/LoadingSpinner';

/** Visible span of the day on the timeline. */
const DAY_START = 7 * 60;   // 07:00
const DAY_END = 18 * 60;    // 18:00
const DAY_SPAN = DAY_END - DAY_START;
const DAYS_AHEAD = 14;

/** Statuses that occupy a room. Pending holds a soft claim, approved is firm. */
const BLOCKING_STATUSES = ['pending', 'approved'];

const HOUR_TICKS = [8, 10, 12, 14, 16];

export default function LabSchedule() {
  const { userProfile, isAdmin } = useAuth();
  const toast = useToast();

  const [date, setDate] = useState(getTodayManila());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // { room, start, end } for booking

  useEffect(() => { load(); }, [date]);

  async function load() {
    setLoading(true);
    setSelected(null);
    try {
      // Queried on bookingDate alone and filtered client-side — a
      // bookingDate + status composite would need an extra Firestore index.
      const snap = await getDocs(
        query(collection(db, 'labBookings'), where('bookingDate', '==', date), limit(300))
      );
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load the room schedule.');
    } finally {
      setLoading(false);
    }
  }

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(getTodayManila(), i));
  const isPast = date < getTodayManila();

  return (
    <div className="space-y-4 max-w-6xl mx-auto animate-fade-in">
      {/* Date strip */}
      <div className="card">
        <div className="card-header">
          <CalendarDays size={18} strokeWidth={1.8} />
          Laboratory Room Schedule
          <span className="ml-auto text-xs text-gold font-medium">
            Availability for {formatDate(date)}
          </span>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate(d => addDays(d, -1))}
              className="btn-secondary btn-sm p-2 shrink-0"
              aria-label="Previous day"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex-1 flex gap-1.5 overflow-x-auto pb-1">
              {days.map(d => {
                const active = d === date;
                const isToday = d === getTodayManila();
                return (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`shrink-0 px-3 py-2 rounded-xl border text-center min-w-[64px] transition-colors ${
                      active
                        ? 'border-crimson bg-crimson text-white shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gold text-gray-600'
                    }`}
                  >
                    <span className="block text-[10px] uppercase tracking-wider opacity-80">
                      {formatDate(d).split(',')[0]}
                    </span>
                    <span className="block text-sm font-bold">
                      {new Date(d + 'T00:00:00').getDate()}
                    </span>
                    {isToday && (
                      <span className="block text-[9px] font-bold uppercase tracking-wider opacity-80">
                        Today
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setDate(d => addDays(d, 1))}
              className="btn-secondary btn-sm p-2 shrink-0"
              aria-label="Next day"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <input
            type="date"
            className="input w-auto mt-3"
            value={date}
            onChange={e => e.target.value && setDate(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="p-6"><PageLoader /></div>
        ) : (
          <div className="p-4 space-y-4">
            {isPast && (
              <div className="flex items-start gap-2.5 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
                <Info size={16} className="shrink-0 mt-0.5" />
                You're viewing a past date. New bookings cannot be made for dates in the past.
              </div>
            )}

            {/* Hour ruler */}
            <div className="flex items-center gap-3 pl-[132px] sm:pl-[148px] pr-1">
              {HOUR_TICKS.map(h => (
                <span key={h} className="text-[10px] text-gray-400 font-medium">
                  {formatTimeOfDay(`${String(h).padStart(2, '0')}:00`)}
                </span>
              ))}
            </div>

            {LAB_ROOMS.map(room => (
              <RoomRow
                key={room.id}
                room={room}
                bookings={bookings.filter(b => b.labRoom === room.id && BLOCKING_STATUSES.includes(b.status))}
                isAdmin={isAdmin}
                canBook={!isPast && isValidGradeLevel(userProfile?.gradeLevel)}
                selected={selected?.room === room.id ? selected : null}
                onSelect={slot => setSelected(slot)}
              />
            ))}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 pt-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-laurel/20 border border-laurel/40" /> Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-gold/30 border border-gold/60" /> Pending request
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-crimson/80" /> Booked
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Booking CTA */}
      {!isAdmin && (
        <div className="card p-4 flex flex-wrap items-center gap-3 bg-gold-pale/30 border-gold/30">
          <DoorOpen size={18} className="text-crimson shrink-0" />
          <div className="flex-1 min-w-[180px]">
            <p className="font-semibold text-sm text-ink">Found a free slot?</p>
            <p className="text-xs text-gray-600">
              {selected
                ? `${selected.room}: ${formatTimeOfDay(selected.start)} – ${formatTimeOfDay(selected.end)} is open.`
                : 'Tap an open window on the timeline above to start a booking.'}
            </p>
          </div>
          <Link
            to={
              selected
                ? `/lab-booking?room=${encodeURIComponent(selected.room)}&date=${date}&start=${selected.start}&end=${selected.end}`
                : '/lab-booking'
            }
            className="btn-primary btn-sm"
          >
            {selected ? 'Book this slot' : 'Book a laboratory'}
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * One room's occupancy timeline for the selected day.
 */
function RoomRow({ room, bookings, isAdmin, canBook, selected, onSelect }) {
  const merged = mergeTimeRanges(bookings);
  const gaps = freeWindows(merged, DAY_START, DAY_END);
  const totalBooked = merged.reduce((sum, r) => sum + (r.end - r.start), 0);

  const pct = mins => `${(Math.max(0, Math.min(DAY_SPAN, mins)) / DAY_SPAN) * 100}%`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="font-semibold text-sm text-ink flex items-center gap-2">
          <DoorOpen size={15} className="text-crimson" strokeWidth={1.8} />
          {room.id}
        </p>
        <span className="text-[11px] text-gray-500">
          {bookings.length === 0
            ? 'Free all day'
            : `${Math.round((totalBooked / DAY_SPAN) * 100)}% booked · ${gaps.length} free window${gaps.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        {/* Track */}
        <div className="relative flex-1 h-16 bg-laurel/10 border border-laurel/30 rounded-xl overflow-hidden">
          {/* Hour gridlines */}
          {HOUR_TICKS.map(h => (
            <span
              key={h}
              className="absolute top-0 bottom-0 w-px bg-gray-200"
              style={{ left: pct((h * 60) - DAY_START) }}
            />
          ))}

          {/* Booked blocks */}
          {merged.map((r, i) => {
            const pending = r.bookings.every(b => b.status === 'pending');
            const mixed = r.bookings.some(b => b.status === 'pending') && r.bookings.some(b => b.status === 'approved');
            return (
              <div
                key={i}
                title={r.bookings
                  .map(b => `${formatTimeOfDay(b.startTime)}–${formatTimeOfDay(b.endTime)}${isAdmin ? ` · ${b.studentName}` : ''}`)
                  .join('\n')}
                className={`absolute top-1 bottom-1 rounded-lg px-2 py-1 overflow-hidden flex flex-col justify-center border ${
                  pending
                    ? 'bg-gold/30 border-gold/60'
                    : mixed
                      ? 'bg-crimson/60 border-crimson'
                      : 'bg-crimson/85 border-crimson-dark text-white'
                }`}
                style={{ left: pct(r.start - DAY_START), width: pct(r.end - r.start) }}
              >
                <p className={`text-[10px] font-bold truncate ${pending ? 'text-crimson-dark' : 'text-white'}`}>
                  {formatTimeOfDay(toTimeString(r.start))}–{formatTimeOfDay(toTimeString(r.end))}
                </p>
                {isAdmin && r.bookings[0]?.studentName && (
                  <p className="text-[10px] truncate opacity-90">{r.bookings[0].studentName}</p>
                )}
                {!isAdmin && pending && (
                  <p className="text-[10px] font-semibold text-crimson-dark truncate">Pending</p>
                )}
              </div>
            );
          })}

          {/* Clickable free windows */}
          {canBook &&
            gaps.map((g, i) => {
              const isSel = selected && selected.start === toTimeString(g.start);
              return (
                <button
                  key={i}
                  onClick={() =>
                    onSelect({ room: room.id, start: toTimeString(g.start), end: toTimeString(g.end) })
                  }
                  title={`Book ${formatTimeOfDay(toTimeString(g.start))} – ${formatTimeOfDay(toTimeString(g.end))}`}
                  className={`absolute top-1 bottom-1 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center ${
                    isSel
                      ? 'border-crimson bg-crimson/15'
                      : 'border-laurel/50 bg-laurel/10 hover:bg-laurel/25'
                  }`}
                  style={{ left: pct(g.start - DAY_START), width: pct(g.minutes) }}
                >
                  <span className={`text-[10px] font-bold ${isSel ? 'text-crimson' : 'text-laurel-dark'}`}>
                    {g.minutes >= 60
                      ? `${Math.floor(g.minutes / 60)}h${g.minutes % 60 ? ` ${g.minutes % 60}m` : ''}`
                      : `${g.minutes}m`}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Free window chips */}
      {gaps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 pl-0">
          {gaps.slice(0, 6).map((g, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                selected && selected.start === toTimeString(g.start)
                  ? 'bg-crimson text-white border-crimson'
                  : 'bg-green-50 text-green-700 border-green-200'
              }`}
            >
              <CheckCircle2 size={10} />
              {formatTimeOfDay(toTimeString(g.start))}–{formatTimeOfDay(toTimeString(g.end))}
            </span>
          ))}
          {gaps.length > 6 && (
            <span className="text-[10px] text-gray-400 self-center">+{gaps.length - 6} more</span>
          )}
        </div>
      )}

      {bookings.length === 0 && (
        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
          <Clock size={11} /> No bookings on this date — the whole day is open.
        </p>
      )}
    </div>
  );
}