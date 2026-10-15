import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Check, CheckCheck, X, ChevronRight, Package, ClipboardCheck, ShieldCheck,
  RotateCcw, PackageCheck, DoorOpen, AlertTriangle, AlertOctagon, Clock3,
  Gavel, CircleSlash,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { timeAgo } from '../lib/helpers';

/**
 * Icon + accent colour per notification tone.
 *
 * `action` is the one tone that means "you have to do something", so it gets
 * the crimson treatment that matches the rest of the app's calls to action.
 */
const TONES = {
  action: { icon: ClipboardCheck, cls: 'bg-crimson text-white', dot: 'bg-crimson' },
  positive: { icon: PackageCheck, cls: 'bg-green-600 text-white', dot: 'bg-green-500' },
  info: { icon: Package, cls: 'bg-sky-600 text-white', dot: 'bg-sky-500' },
  caution: { icon: AlertTriangle, cls: 'bg-amber-500 text-white', dot: 'bg-amber-500' },
  warning: { icon: Clock3, cls: 'bg-orange-600 text-white', dot: 'bg-orange-500' },
  danger: { icon: AlertOctagon, cls: 'bg-red-600 text-white', dot: 'bg-red-500' },
};

const KIND_ICONS = {
  request_pending: ClipboardCheck,
  return_proof: ShieldCheck,
  overdue: AlertOctagon,
  flagged_waiting: RotateCcw,
  booking_pending: DoorOpen,
  approved: PackageCheck,
  rejected: CircleSlash,
  borrowed: Package,
  proof_pending: Clock3,
  flagged: RotateCcw,
  returned: PackageCheck,
  booking_approved: DoorOpen,
  booking_rejected: CircleSlash,
  booking_cancelled: CircleSlash,
  booking_completed: PackageCheck,
  warning: AlertTriangle,
  penalty: Gavel,
};

/**
 * Header notification bell.
 *
 * Opening the panel lists every derived notification; clicking one navigates to
 * the page that notification belongs to and marks it read. Nothing is
 * hard-coded to a single destination the way the old bell was.
 */
export default function NotificationBell() {
  const { notifications, unreadCount, markSeen, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = e => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function handleClick(notification) {
    markSeen(notification.at);
    setOpen(false);
    // `to` is always internal, so a plain push is safe.
    navigate(notification.to);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-xl hover:bg-white/10 transition-colors text-cream hover:text-white"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications'}
      >
        <Bell size={18} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-flame text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 bg-white text-ink rounded-xl shadow-xl border border-gold/30 w-[380px] max-w-[calc(100vw-1.5rem)] overflow-hidden z-50 animate-fade-in"
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 bg-gold-pale/30">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm text-crimson-dark">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-crimson text-white rounded-full px-1.5 py-0.5">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] font-medium text-crimson hover:text-gold inline-flex items-center gap-1"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label="Close notifications"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2.5">
                <Check size={20} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-700">You're all caught up</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Updates about requests, returns and bookings will appear here.
              </p>
            </div>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
              {notifications.map(n => (
                <NotificationRow key={n.id} notification={n} onClick={() => handleClick(n)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({ notification, onClick }) {
  const tone = TONES[notification.tone] || TONES.info;
  const Icon = KIND_ICONS[notification.kind] || tone.icon;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gold-pale/40 ${
          notification.unread ? 'bg-crimson/[0.04]' : ''
        }`}
      >
        <span className={`${tone.cls} w-8 h-8 rounded-lg flex items-center justify-center shrink-0`}>
          <Icon size={15} strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className={`text-sm leading-snug flex-1 ${notification.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
              {notification.title}
            </span>
            {notification.unread && (
              <span className={`w-2 h-2 rounded-full ${tone.dot} shrink-0 mt-1.5`} aria-label="Unread" />
            )}
          </span>

          <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{notification.body}</span>

          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
            <span className="text-[10px] text-gray-400">{timeAgo(notification.at)}</span>
            {notification.meta && (
              <span className="text-[10px] text-gray-400 truncate max-w-[190px]">{notification.meta}</span>
            )}
            {notification.action && (
              <span className="text-[10px] font-semibold text-crimson inline-flex items-center gap-0.5">
                {notification.action} <ChevronRight size={10} />
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}