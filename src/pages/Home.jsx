import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, CheckSquare, Archive, Clock, AlertTriangle,
  FileText, ClipboardList, BookOpen, MessageCircle,
  ChevronRight, Calendar, Megaphone, CheckCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import {
  collection, query, where, onSnapshot, getDocs,
  orderBy, limit, getDoc, doc,
} from 'firebase/firestore';
import { getTodayManila, formatDate, isOverdue } from '../lib/helpers';
import { StatusBadge } from '../components/StatusBadge';
import { CardSkeleton } from '../components/LoadingSpinner';

function SummaryCard({ label, value, icon: Icon, color, loading }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-primary-500',  val: 'text-primary-700' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-500',    val: 'text-green-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500',   val: 'text-purple-700' },
    amber:  { bg: 'bg-amber-50',  icon: 'text-amber-500',    val: 'text-amber-700' },
    red:    { bg: 'bg-red-50',    icon: 'text-red-500',      val: 'text-red-700' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className={`card p-5 ${c.bg}`}>
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-4 w-1/2 rounded" />
          <div className="skeleton h-8 w-1/3 rounded" />
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.val}`}>{value ?? '—'}</p>
          </div>
          <div className={`p-2.5 rounded-xl bg-white/60 ${c.icon}`}>
            <Icon size={22} strokeWidth={1.8} />
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAccessCard({ to, icon: Icon, title, desc }) {
  return (
    <Link
      to={to}
      className="card p-4 flex items-center gap-3 hover:shadow-md hover:border-primary-200 transition-all group"
    >
      <div className="bg-primary-50 p-2.5 rounded-xl text-primary-500 group-hover:bg-primary-100 transition-colors">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-800">{title}</p>
        <p className="text-xs text-gray-500 truncate">{desc}</p>
      </div>
      <ChevronRight size={16} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
    </Link>
  );
}

export default function Home() {
  const { userProfile, isAdmin } = useAuth();
  const today = getTodayManila();
  const [stats, setStats] = useState({});
  const [recentRequests, setRecentRequests] = useState([]);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile || !db) return;

    async function loadData() {
      try {
        // Equipment totals
        const eqSnap = await getDocs(collection(db, 'equipment'));
        let totalQty = 0, availableQty = 0;
        eqSnap.forEach(d => {
          totalQty += d.data().totalQty || 0;
          availableQty += d.data().availableQty || 0;
        });

        // Requests
        let reqQ, pendingQ;
        if (isAdmin) {
          reqQ = query(collection(db, 'requests'), orderBy('requestDate', 'desc'), limit(8));
          pendingQ = query(collection(db, 'requests'), where('status', '==', 'pending'));
        } else {
          reqQ = query(
            collection(db, 'requests'),
            where('userId', '==', userProfile.uid),
            orderBy('requestDate', 'desc'),
            limit(8)
          );
          pendingQ = query(
            collection(db, 'requests'),
            where('userId', '==', userProfile.uid),
            where('status', '==', 'pending')
          );
        }

        const [recentSnap, pendingSnap] = await Promise.all([
          getDocs(reqQ),
          getDocs(pendingQ),
        ]);

        const requests = recentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRecentRequests(requests);

        // Overdue and borrowed counts
        let borrowedCount = 0, overdueCount = 0;
        if (isAdmin) {
          const borrowedSnap = await getDocs(
            query(collection(db, 'requests'), where('status', 'in', ['borrowed', 'approved']))
          );
          borrowedSnap.forEach(d => {
            const r = d.data();
            if (isOverdue(r.status, r.expectedReturnDate)) overdueCount++;
            else borrowedCount++;
          });
        }

        // Today's schedule
        const schedQ = isAdmin
          ? query(collection(db, 'requests'), where('experimentDate', '==', today), where('status', 'in', ['approved', 'borrowed']))
          : query(collection(db, 'requests'), where('userId', '==', userProfile.uid), where('experimentDate', '==', today), where('status', 'in', ['approved', 'borrowed']));
        const schedSnap = await getDocs(schedQ);
        setTodaySchedule(schedSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Contact
        const contactSnap = await getDoc(doc(db, 'settings', 'contact'));
        if (contactSnap.exists()) setContact(contactSnap.data());

        setStats({
          totalQty,
          availableQty,
          borrowed: borrowedCount,
          pending: pendingSnap.size,
          overdue: overdueCount,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    // Use onSnapshot for live dashboard counts
    const reqQ = isAdmin
      ? query(collection(db, 'requests'), orderBy('requestDate', 'desc'), limit(8))
      : query(collection(db, 'requests'), where('userId', '==', userProfile.uid), orderBy('requestDate', 'desc'), limit(8));

    const unsub = onSnapshot(reqQ, (snap) => {
      setRecentRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    loadData();
    return unsub;
  }, [userProfile, isAdmin, today]);

  const summaryCards = [
    { label: 'Total Equipment', value: stats.totalQty, icon: Package, color: 'blue' },
    { label: 'Available Equipment', value: stats.availableQty, icon: CheckSquare, color: 'green' },
    ...(isAdmin ? [
      { label: 'Currently Borrowed', value: stats.borrowed, icon: Archive, color: 'purple' },
    ] : []),
    { label: 'Pending Requests', value: stats.pending, icon: Clock, color: 'amber' },
    ...(isAdmin ? [
      { label: 'Overdue Equipment', value: stats.overdue, icon: AlertTriangle, color: 'red' },
    ] : []),
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 text-white p-6 md:p-8">
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold">Welcome to LabTrack!</h1>
          <p className="mt-2 text-blue-100 max-w-xl">
            Manage laboratory equipment, submit borrowing requests, and keep track of your laboratory needs — all in one place.
          </p>
          <p className="mt-3 text-blue-200 text-sm italic">Science today, solutions tomorrow.</p>
          {userProfile && (
            <p className="mt-2 text-blue-100 text-sm font-medium">
              {userProfile.name} · {userProfile.gradeLevel} · {userProfile.section}
            </p>
          )}
        </div>
        {/* Decorative Image with Seamless Fading Effect */}
        <div 
          className="absolute right-0 top-0 h-full w-2/3 md:w-1/2 pointer-events-none mix-blend-overlay"
          style={{ 
            maskImage: 'linear-gradient(to right, transparent, black 30%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 30%)'
          }}
        >
          <img 
            src="/images/flask.jpg" 
            alt="" 
            className="w-full h-full object-cover opacity-50"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className={`grid grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
        {loading
          ? Array.from({ length: isAdmin ? 5 : 4 }).map((_, i) => <CardSkeleton key={i} />)
          : summaryCards.map(c => <SummaryCard key={c.label} {...c} />)
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Requests */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <FileText size={18} strokeWidth={1.8} />
            Recent Requests
            <Link to={isAdmin ? '/admin/requests' : '/my-requests'} className="ml-auto text-xs text-blue-100 hover:text-white flex items-center gap-1">
              View All <ChevronRight size={14} />
            </Link>
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="skeleton h-10 rounded" />)}
            </div>
          ) : recentRequests.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileText size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No requests yet.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    {isAdmin && <th>Student</th>}
                    <th>Experiment / Activity</th>
                    <th>Date Requested</th>
                    <th>Exp. Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map(r => (
                    <tr key={r.id}>
                      {isAdmin && <td data-label="Student">{r.borrowerName}</td>}
                      <td data-label="Experiment">{r.experiment}</td>
                      <td data-label="Date Requested">{formatDate(r.requestDate)}</td>
                      <td data-label="Exp. Date">{formatDate(r.experimentDate)}</td>
                      <td data-label="Status">
                        <StatusBadge status={r.status} expectedReturnDate={r.expectedReturnDate} />
                      </td>
                      <td>
                        <Link to={`/requests/${r.id}`} className="btn-secondary btn-sm">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Quick Access */}
          <div className="card">
            <div className="card-header">
              <ChevronRight size={18} strokeWidth={1.8} />
              Quick Access
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              <QuickAccessCard to="/inventory" icon={Package} title="View Inventory" desc="Check available equipment and quantities" />
              <QuickAccessCard to="/request" icon={ClipboardList} title="Submit Request" desc="Request laboratory equipment" />
              <QuickAccessCard to="/my-requests" icon={FileText} title="My Requests" desc="Track your requests and status" />
              <QuickAccessCard to="/rules" icon={BookOpen} title="Rules & Penalties" desc="View laboratory rules and consequences" />
            </div>
          </div>

          {/* Today's Schedule */}
          <div className="card">
            <div className="card-header">
              <Calendar size={18} strokeWidth={1.8} />
              Today's Schedule
              <span className="ml-auto text-xs text-blue-200">{formatDate(today)}</span>
            </div>
            <div className="p-3">
              {todaySchedule.length === 0 ? (
                <div className="py-6 text-center text-gray-400">
                  <Calendar size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No experiment schedule for today.</p>
                  <p className="text-xs text-gray-400 mt-1">Check your requests or upcoming dates.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todaySchedule.map(r => (
                    <div key={r.id} className="flex items-center gap-2 p-2 bg-primary-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.experiment}</p>
                        <p className="text-xs text-gray-500">{r.borrowerName}</p>
                      </div>
                      <StatusBadge status={r.status} expectedReturnDate={r.expectedReturnDate} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Important Reminders */}
        <div className="card">
          <div className="card-header">
            <Megaphone size={18} strokeWidth={1.8} />
            Important Reminders
          </div>
          <div className="p-4">
            <ul className="space-y-3">
              {[
                'Submit your equipment request at least 3 school days before the experiment date.',
                'Return equipment on or before the expected return date.',
                'Keep the equipment clean, complete, and properly arranged.',
              ].map((r, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Need Help */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <MessageCircle size={18} strokeWidth={1.8} />
            Need Help?
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-3">
              Contact the laboratory staff for any concerns or inquiries.
            </p>
            {contact && (
              <div className="space-y-1 text-sm text-gray-700 mb-4">
                {contact.name && <p className="font-medium">{contact.name}</p>}
                {contact.email && <p>{contact.email}</p>}
                {contact.phone && <p>{contact.phone}</p>}
                {contact.location && <p className="text-gray-500">{contact.location}</p>}
              </div>
            )}
            <a
              href={contact?.email ? `mailto:${contact.email}` : '#'}
              className="btn-primary w-full justify-center"
            >
              <MessageCircle size={16} />
              Contact Staff
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
