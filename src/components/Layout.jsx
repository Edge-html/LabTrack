import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Package, ClipboardList, FileText, BookOpen, Info,
  Settings, Users, BarChart2, AlertTriangle, Bell, ChevronDown,
  LogOut, Menu, X, FlaskConical,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const studentNav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/inventory', label: 'Equipment Inventory', icon: Package },
  { to: '/request', label: 'Request Equipment', icon: ClipboardList },
  { to: '/my-requests', label: 'My Requests', icon: FileText },
  { to: '/rules', label: 'Rules & Penalties', icon: BookOpen },
  { to: '/about', label: 'About', icon: Info },
];

const adminNav = [
  { to: '/admin/requests', label: 'Manage Requests', icon: BarChart2 },
  { to: '/admin/borrowing', label: 'Borrowing & Returns', icon: ClipboardList },
  { to: '/admin/penalties', label: 'Penalties & Violations', icon: AlertTriangle },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

function MicroscopeSVG() {
  return (
    <svg viewBox="0 0 80 100" className="w-20 h-24 opacity-30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="5" width="8" height="20" rx="4" stroke="white" strokeWidth="2"/>
      <rect x="25" y="22" width="18" height="10" rx="3" stroke="white" strokeWidth="2"/>
      <path d="M34 32 L34 55" stroke="white" strokeWidth="2"/>
      <ellipse cx="34" cy="60" rx="10" ry="6" stroke="white" strokeWidth="2"/>
      <path d="M20 75 Q34 65 48 75" stroke="white" strokeWidth="2"/>
      <rect x="10" y="75" width="48" height="5" rx="2.5" stroke="white" strokeWidth="2"/>
      <circle cx="34" cy="48" r="8" stroke="white" strokeWidth="1.5"/>
    </svg>
  );
}

function NavLink({ to, label, icon: Icon, onClick }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ mobileOpen, onClose }) {
  const { userProfile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-navy text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="bg-white/10 rounded-xl p-1.5">
          <FlaskConical size={22} className="text-white" strokeWidth={1.8} />
        </div>
        <div>
          <div className="font-bold text-lg leading-tight">LabTrack</div>
          <div className="text-[10px] text-blue-200 leading-tight">KNCHS Laboratory System</div>
        </div>
        {mobileOpen !== undefined && (
          <button onClick={onClose} className="ml-auto text-blue-200 hover:text-white lg:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {studentNav
          .filter(item => {
            if (isAdmin && (item.to === '/request' || item.to === '/my-requests')) {
              return false;
            }
            return true;
          })
          .map(item => (
            <NavLink key={item.to} {...item} onClick={onClose} />
          ))}
        {isAdmin && (
          <>
            <div className="mt-4 mb-2 px-4">
              <span className="text-[10px] uppercase tracking-widest text-blue-300 font-semibold">Admin</span>
            </div>
            {adminNav.map(item => (
              <NavLink key={item.to} {...item} onClick={onClose} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10">
        <div className="flex flex-col items-center gap-2 mb-3">
          <MicroscopeSVG />
          <p className="text-center text-[11px] text-blue-200 leading-snug">
            Safe Equipment.<br />Better Experiments.<br />Brighter Futures.
          </p>
          <p className="text-[10px] font-bold tracking-widest text-blue-300">— KNCHS —</p>
        </div>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-red-300 hover:text-red-200 hover:bg-red-900/20"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="relative w-64 h-full animate-slide-in">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

export function Header({ onMenuClick, notifCount }) {
  const { userProfile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <header className="bg-navy text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-md">
      <button
        onClick={onMenuClick}
        className="lg:hidden text-blue-200 hover:text-white p-1"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      {/* Brand - visible on mobile */}
      <div className="flex items-center gap-2 lg:hidden">
        <FlaskConical size={20} strokeWidth={1.8} />
        <span className="font-bold text-base">LabTrack</span>
      </div>

      {/* Desktop subtitle */}
      <div className="hidden lg:block text-blue-200 text-xs">
        KNCHS Science Laboratory Equipment Inventory & Borrowing System
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative">
          <button className="p-2 rounded-xl hover:bg-white/10 transition-colors relative" aria-label="Notifications">
            <Bell size={18} strokeWidth={1.8} />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2 rounded-xl hover:bg-white/10 px-2 py-1.5 transition-colors"
            aria-label="User menu"
          >
            <div className="w-8 h-8 rounded-full bg-primary-400 flex items-center justify-center font-bold text-sm">
              {userProfile?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold leading-tight">{userProfile?.name || 'User'}</div>
              <div className="text-[10px] text-blue-200 leading-tight">
                {userProfile?.gradeLevel} · {userProfile?.section}
              </div>
            </div>
            <ChevronDown size={14} className="text-blue-200" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white text-gray-800 rounded-xl shadow-xl border border-gray-200 w-48 overflow-hidden z-50 animate-fade-in">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <div className="font-semibold text-sm">{userProfile?.name}</div>
                <div className="text-xs text-gray-500">{userProfile?.role}</div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
