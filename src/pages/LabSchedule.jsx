import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Info, Loader2, Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import {
  getTodayManila, addDays, formatDate, formatTimeOfDay,
  minutesOfDay, toTimeString, LAB_ROOMS, isValidGradeLevel,
} from '../lib/helpers';
import { useLabRooms } from '../hooks/useLabRooms';

/** Visible span of the day on the grid. */
const DAY_START = 7 * 60;  // 7:00 AM
const DAY_END = 18 * 60;   // 6:00 PM
const HOUR_H = 56;         // px per hour
const GRID_H = ((DAY_END - DAY_START) / 60) * HOUR_H;
const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const BLOCKING_STATUSES = ['pending', 'approved'];

/** Monday of the week containing `dateStr`. */
function startOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return d.toLocaleDateString('en-CA');
}

/**
 * Assign side-by-side lanes to events that overlap in time, so two
 * simultaneous bookings each get half the column instead of stacking.
 */
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);
  const out = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    const placed = cluster.map(e => {
      let lane = laneEnds.findIndex(end => end <= e.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e.endMin);
      } else {
        laneEnds[lane] = e.endMin;
      }
      return { ...e, lane };
    });
    placed.forEach(p => out.push({ ...p, laneCount: laneEnds.length }));
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const e of sorted) {
    if (e.startMin >= clusterEnd && cluster.length) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.endMin);
  }
  flush();
  return out;
}

export default function LabSchedule() {
  const { userProfile, isAdmin } = useAuth();
  const toast = useToast();
  const { rooms } = useLabRooms();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(getTodayManila()));
  const [roomId, setRoomId] = useState(LAB_ROOMS[0].id);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // { date, start, end }

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = weekDays[6];
  const today = getTodayManila();

  useEffect(() => {
    if (rooms.length && !rooms.some(room => room.id === roomId)) setRoomId(rooms[0].id);
  }, [rooms, roomId]);

  useEffect(() => { load(); }, [weekStart]);

  async function load() {
    setLoading(true);
    setSelected(null);
    try {
      // Single-field range query — no composite index required.
      const snap = await getDocs(
        query(
          collection(db, 'labBookings'),
          where('bookingDate', '>=', weekStart),
          where('bookingDate', '<=', weekEnd),
          limit(500)
        )
      );
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load the room schedule.');
    } finally {
      setLoading(false);
    }
  }

  const roomBookings = bookings.filter(
    b => b.labRoom === roomId && BLOCKING_STATUSES.includes(b.status)
  );

  const byDay = useMemo(() => {
    const map = {};
    for (const d of weekDays) {
      map[d] = layoutDay(
        roomBookings
          .filter(b => b.bookingDate === d)
          .map(b => ({
            ...b,
            startMin: minutesOfDay(b.startTime),
            endMin: minutesOfDay(b.endTime),
          }))
          .filter(b => b.startMin !== null && b.endMin !== null && b.endMin > b.startMin)
      );
    }
    return map;
  }, [roomBookings, weekDays]);

  const roomLabel = rooms.find(r => r.id === roomId)?.id || roomId;
  const canBook = isValidGradeLevel(userProfile?.gradeLevel);
  const isCurrentWeek = weekStart === startOfWeek(today);

  return (
    <div className="space-y-4 max-w-6xl mx-auto animate-fade-in">
      <div className="card">
        <div className="card-header">
          <CalendarDays size={18} strokeWidth={1.8} />
          Laboratory Room Schedule
          <span className="ml-auto text-xs text-gold font-medium">{roomLabel}</span>
        </div>

        {/* Week navigation */}
        <div className="p-3 sm:p-4 flex flex-wrap items-center gap-2 border-b border-gray-100">
          <button
            onClick={() => setWeekStart(w => addDays(w, -7))}
            className="btn-secondary btn-sm p-2"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(today))}
            disabled={isCurrentWeek}
            className="btn-secondary btn-sm"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(w => addDays(w, 7))}
            className="btn-secondary btn-sm p-2"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
          <p className="font-semibold text-sm text-ink ml-1">
            {formatDate(weekStart)} – {formatDate(weekEnd)}
          </p>

          {/* Room switch */}
          <div className="ml-auto flex gap-1 bg-gray-100 rounded-xl p-1">
            {rooms.map(r => (
              <button
                key={r.id}
                onClick={() => { setRoomId(r.id); setSelected(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  roomId === r.id
                    ? 'bg-crimson text-white shadow-sm'
                    : 'text-gray-600 hover:bg-white'
                }`}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>

        {/* Day headers */}
        <div className="flex border-b border-gray-200 bg-gold-pale/30">
          <div className="w-14 sm:w-16 shrink-0 border-r border-gray-200" />
          {weekDays.map((d, i) => {
            const isToday = d === today;
            const isPast = d < today;
            return (
              <div
                key={d}
                className={`flex-1 min-w-0 py-2 text-center border-r border-gray-100 last:border-r-0 ${
                  isToday ? 'bg-crimson/10' : ''
                }`}
              >
                <p className={`text-[10px] font-bold tracking-wider ${isToday ? 'text-crimson' : 'text-gray-400'}`}>
                  {DAYS[i]}
                </p>
                <p
                  className={`text-sm font-bold leading-tight ${
                    isToday ? 'text-crimson' : isPast ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  {new Date(d + 'T00:00:00').getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" /> Loading schedule…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex min-w-[640px]">
              {/* Time gutter */}
              <div className="w-14 sm:w-16 shrink-0 border-r border-gray-200 relative" style={{ height: GRID_H }}>
                {HOURS.map(h => (
                  <span
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-gray-400"
                    style={{ top: ((h * 60 - DAY_START) / 60) * HOUR_H }}
                  >
                    {formatTimeOfDay(`${String(h).padStart(2, '0')}:00`)}
                  </span>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((d, i) => {
                const isToday = d === today;
                const isPast = d < today;
                const events = byDay[d] || [];
                return (
                  <div
                    key={d}
                    className={`flex-1 min-w-0 relative border-r border-gray-100 last:border-r-0 ${
                      isToday ? 'bg-crimson/[0.03]' : ''
                    }`}
                    style={{ height: GRID_H }}
                  >
                    {/* Hour lines */}
                    {HOURS.map(h => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ top: ((h * 60 - DAY_START) / 60) * HOUR_H }}
                      />
                    ))}
                    {/* Half-hour lines */}
                    {HOURS.map(h => (
                      <div
                        key={h + '-half'}
                        className="absolute left-0 right-0 border-t border-dashed border-gray-100/70"
                        style={{ top: ((h * 60 - DAY_START) / 60) * HOUR_H + HOUR_H / 2 }}
                      />
                    ))}

                    {/* Clickable empty hours to start a booking */}
                    {canBook &&
                      !isPast &&
                      HOURS.map(h => {
                        const slotStart = h * 60;
                        const slotEnd = slotStart + 60;
                        const taken = events.some(e => e.startMin < slotEnd && slotStart < e.endMin);
                        if (taken) return null;
                        const isSel =
                          selected && selected.date === d && selected.start === toTimeString(slotStart);
                        return (
                          <button
                            key={`slot-${h}`}
                            onClick={() =>
                              setSelected(
                                isSel ? null : { date: d, start: toTimeString(slotStart), end: toTimeString(slotEnd) }
                              )
                            }
                            className={`absolute left-0 right-0 transition-colors ${
                              isSel ? 'bg-crimson/15' : 'hover:bg-laurel/10'
                            }`}
                            style={{
                              top: ((slotStart - DAY_START) / 60) * HOUR_H,
                              height: HOUR_H,
                            }}
                            aria-label={`Book ${formatDate(d)} at ${formatTimeOfDay(toTimeString(slotStart))}`}
                          />
                        );
                      })}

                    {/* Booking blocks */}
                    {events.map(e => {
                      const top = ((Math.max(e.startMin, DAY_START) - DAY_START) / 60) * HOUR_H;
                      const bottom = ((Math.min(e.endMin, DAY_END) - DAY_START) / 60) * HOUR_H;
                      const h = Math.max(20, bottom - top - 2);
                      const w = 100 / e.laneCount;
                      const pending = e.status === 'pending';
                      const clipped = e.startMin < DAY_START || e.endMin > DAY_END;
                      return (
                        <div
                          key={e.id}
                          title={`${formatTimeOfDay(e.startTime)}–${formatTimeOfDay(e.endTime)}${
                            isAdmin ? ` · ${e.studentName}` : ''
                          }${clipped ? ' (extends outside 7 AM–6 PM)' : ''}`}
                          className={`absolute rounded-lg px-1.5 py-1 overflow-hidden border-l-4 ${
                            pending
                              ? 'bg-amber-100 border-amber-500 text-amber-900 border-dashed border-l-solid'
                              : 'bg-crimson border-crimson-dark text-white'
                          }`}
                          style={{
                            top,
                            height: h,
                            left: `${e.lane * w}%`,
                            width: `calc(${w}% - 4px)`,
                          }}
                        >
                          <p className="text-[10px] font-bold leading-tight truncate">
                            {formatTimeOfDay(e.startTime)}–{formatTimeOfDay(e.endTime)}
                          </p>
                          {h > 34 && (
                            <p className="text-[10px] leading-tight truncate opacity-90">
                              {isAdmin
                                ? e.studentName
                                : pending
                                  ? 'Pending'
                                  : 'Booked'}
                            </p>
                          )}
                          {h > 52 && isAdmin && e.purpose && (
                            <p className="text-[10px] leading-tight truncate opacity-75">{e.purpose}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="p-3 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-crimson" /> Booked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 border border-dashed border-amber-500" /> Pending request
          </span>
          {!isAdmin && canBook && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border border-gray-200 bg-laurel/10" /> Click an empty hour to book
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-gray-400">
            <Info size={12} /> Grid shows 7:00 AM – 6:00 PM
          </span>
        </div>
      </div>

      {/* Booking CTA */}
      {!isAdmin && (
        <div className="card p-4 flex flex-wrap items-center gap-3 bg-gold-pale/30 border-gold/30">
          <DoorOpen size={18} className="text-crimson shrink-0" />
          <div className="flex-1 min-w-[180px]">
            <p className="font-semibold text-sm text-ink">Book a slot</p>
            <p className="text-xs text-gray-600">
              {selected
                ? `${roomLabel} is free on ${formatDate(selected.date)}, ${formatTimeOfDay(selected.start)} – ${formatTimeOfDay(selected.end)}.`
                : 'Click any empty hour in the grid to start a booking for that time.'}
            </p>
          </div>
          <Link
            to={
              selected
                ? `/lab-booking?room=${encodeURIComponent(roomId)}&date=${selected.date}&start=${selected.start}&end=${selected.end}`
                : '/lab-booking'
            }
            className="btn-primary btn-sm"
          >
            <Clock size={14} />
            {selected ? 'Book this slot' : 'Book a laboratory'}
          </Link>
        </div>
      )}
    </div>
  );
}
