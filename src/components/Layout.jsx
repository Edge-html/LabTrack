import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Package, ClipboardList, FileText, BookOpen, Info,
  Settings, Users, BarChart2, AlertTriangle, Bell, ChevronDown,
  LogOut, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import knchsLogo from '../assets/knchs-logo.png';

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
    <svg viewBox="0 0 80 100" className="w-16 h-20 opacity-30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="5" width="8" height="20" rx="4" stroke="currentColor" strokeWidth="2"/>
      <rect x="25" y="22" width="18" height="10" rx="3" stroke="currentColor" strokeWidth="2"/>
      <path d="M34 32 L34 55" stroke="currentColor" strokeWidth="2"/>
      <ellipse cx="34" cy="60" rx="10" ry="6" stroke="currentColor" strokeWidth="2"/>
      <path d="M20 75 Q34 65 48 75" stroke="currentColor" strokeWidth="2"/>
      <rect x="10" y="75" width="48" height="5" rx="2.5" stroke="currentColor" strokeWidth="2"/>
      <circle cx="34" cy="48" r="8" stroke="currentColor" strokeWidth="1.5"/>
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
      <Icon size={18} strokeWidth={1.8} className={active ? 'text-gold' : 'text-cream/80'} />
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
    <div className="relative flex flex-col h-full bg-crimson-dark text-white border-r border-gold/20 overflow-hidden">
      {/* Subtle watermark in sidebar background */}
      <div 
        className="absolute -right-12 top-[58%] -translate-y-1/2 pointer-events-none opacity-[0.08] select-none z-0"
        aria-hidden="true"
      >
        <img src={knchsLogo} alt="" className="w-72 h-72 object-contain filter brightness-125" />
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gold/20 bg-black/10 shrink-0">
        <div className="relative group shrink-0">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-gold to-gold-light rounded-full blur-[1px] opacity-60"></div>
          <img 
            src={knchsLogo} 
            alt="KNCHS Seal" 
            className="relative w-9 h-9 rounded-full object-contain bg-white p-0.5 shadow-sm ring-2 ring-gold/60" 
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-bold text-lg text-white tracking-tight leading-none">Lab<span className="text-gold">Track</span></span>
          </div>
          <div className="text-[10px] font-bold text-cream/90 tracking-wider uppercase truncate leading-tight mt-0.5">
            KNCHS SHS Lab System
          </div>
        </div>
        {mobileOpen !== undefined && (
          <button onClick={onClose} className="ml-auto text-cream/70 hover:text-white lg:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
              <span className="text-[10px] uppercase tracking-widest text-gold font-bold">Admin</span>
            </div>
            {adminNav.map(item => (
              <NavLink key={item.to} {...item} onClick={onClose} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10">
        <div className="flex flex-col items-center gap-1.5 mb-3 text-gold">
          <p className="text-center text-[11px] text-cream/80 leading-snug">
            Safe Equipment.<br />Better Experiments.<br />Brighter Futures.
          </p>
          <p className="text-[10px] font-bold tracking-widest text-gold">— KNCHS —</p>
        </div>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-red-300 hover:text-red-200 hover:bg-red-900/30"
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
    <header className="bg-crimson-dark text-white px-4 md:px-6 h-16 flex items-center gap-4 sticky top-0 z-30 shadow-sm border-b border-gold/20">
      <button
        onClick={onMenuClick}
        className="lg:hidden text-cream hover:text-white p-1"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      {/* Brand - visible on mobile */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="relative shrink-0">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-gold to-gold-light rounded-full blur-[1px] opacity-50"></div>
          <img src={knchsLogo} alt="KNCHS Logo" className="relative w-7 h-7 rounded-full object-contain bg-white p-px shadow-sm ring-1 ring-gold/60" />
        </div>
        <span className="font-bold text-lg text-white tracking-tight">Lab<span className="text-gold">Track</span></span>
      </div>

      {/* Desktop subtitle */}
      <div className="hidden lg:block text-gold text-xs font-semibold tracking-wide">
        KNCHS SHS Laboratory System
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative">
          <button className="p-2 rounded-xl hover:bg-white/10 transition-colors relative text-cream hover:text-white" aria-label="Notifications">
            <Bell size={18} strokeWidth={1.8} />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-flame text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
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
            <div className="w-8 h-8 rounded-full bg-gold text-crimson-dark flex items-center justify-center font-bold text-sm shadow-sm">
              {userProfile?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold leading-tight text-white">{userProfile?.name || 'User'}</div>
              <div className="text-[10px] text-gold font-medium leading-tight">
                {userProfile?.gradeLevel} · {userProfile?.section}
              </div>
            </div>
            <ChevronDown size={14} className="text-gold" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white text-ink rounded-xl shadow-xl border border-gold/30 w-48 overflow-hidden z-50 animate-fade-in">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gold-pale/30">
                <div className="font-semibold text-sm text-crimson-dark">{userProfile?.name}</div>
                <div className="text-xs text-gray-500 capitalize">{userProfile?.role}</div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-crimson hover:bg-gold-pale transition-colors font-medium"
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
