import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Users,
  Building2,
  ClipboardList,
  CalendarCheck,
  CalendarOff,
  CalendarRange,
  Activity,
  ListTodo,
  Megaphone,
  MessageCircleQuestion,
  Wallet,
  History,
  Settings,
  Fingerprint,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  Languages,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { Avatar } from './ui';
import { LogoMark } from './Logo';

/** One nav definition drives the sidebar, the mobile bar and the more-sheet. */
export function useNavigation() {
  const { can, isStaff, isEmployee, isSuperAdmin } = useAuth();

  return useMemo(() => {
    const items = [
      { to: '/', label: 'Dashboard', hi: 'डैशबोर्ड', icon: LayoutDashboard, show: true, end: true },
      { to: '/work', label: 'My Work', hi: 'मेरा काम', icon: ClipboardList, show: isEmployee },
      { to: '/weekly-report', label: 'Weekly Report', hi: 'साप्ताहिक रिपोर्ट', icon: CalendarRange, show: isEmployee },
      { to: '/my-health', label: 'My Health', hi: 'मेरा स्वास्थ्य', icon: Activity, show: isEmployee },
      { to: '/approvals', label: 'Approvals', hi: 'अनुमोदन', icon: ShieldCheck, show: can('work.approve') },
      { to: '/employees', label: 'Employees', hi: 'कर्मचारी', icon: Users, show: can('employees.view') },
      { to: '/departments', label: 'Departments', hi: 'विभाग', icon: Building2, show: can('departments.view') || isSuperAdmin },
      { to: '/attendance', label: 'Attendance', hi: 'उपस्थिति', icon: CalendarCheck, show: true },
      { to: '/leave', label: 'Leave', hi: 'छुट्टी', icon: CalendarOff, show: true },
      { to: '/tasks', label: 'Tasks', hi: 'कार्य', icon: ListTodo, show: true },
      { to: '/notices', label: 'Notices', hi: 'सूचनाएँ', icon: Megaphone, show: true },
      { to: '/queries', label: 'Questions', hi: 'प्रश्न', icon: MessageCircleQuestion, show: true },
      { to: '/salary', label: isStaff ? 'Payroll' : 'My Salary', hi: 'वेतन', icon: Wallet, show: can('salary.view') || isEmployee },
      { to: '/history', label: 'History Log', hi: 'इतिहास', icon: History, show: can('audit.view') },
      {
        to: '/attendance-sync',
        label: 'Attendance Sync',
        hi: 'उपस्थिति सिंक',
        icon: Fingerprint,
        show: isSuperAdmin,
      },
      { to: '/settings', label: 'Settings', hi: 'सेटिंग', icon: Settings, show: true },
    ];
    return items.filter((i) => i.show);
  }, [can, isStaff, isEmployee, isSuperAdmin]);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, hindi, toggleHindi, t } = useUI();
  const nav = useNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [location.pathname]);

  const roleLabel = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    EMPLOYEE: 'Employee',
  }[user?.role];

  // Phones get the five most-used destinations in a bottom bar; the rest sit
  // behind "More" (Section 16.1 — large tap targets, one thumb).
  const primary = nav.slice(0, 4);
  const rest = nav.slice(4);

  return (
    <div className="min-h-full bg-white dark:bg-black">
      {/* ── Sidebar (desktop) ─────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-ink-200 bg-white/90 backdrop-blur-xl lg:flex dark:border-white/12 dark:bg-black/90">
        <Brand />
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {nav.map((item) => (
            <NavItem key={item.to} item={item} label={t(item.label, item.hi)} />
          ))}
        </nav>
        <UserCard user={user} roleLabel={roleLabel} onLogout={logout} />
      </aside>

      {/* ── Mobile drawer ─────────────────────────────────────────────── */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-fade-up flex-col border-r border-ink-200 bg-white dark:border-white/12 dark:bg-black">
            <Brand onClose={() => setDrawer(false)} />
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
              {nav.map((item) => (
                <NavItem key={item.to} item={item} label={t(item.label, item.hi)} />
              ))}
            </nav>
            <UserCard user={user} roleLabel={roleLabel} onLogout={logout} />
          </aside>
        </div>
      )}

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur-xl dark:border-white/12 dark:bg-black/90">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setDrawer(true)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-black lg:hidden dark:border-white/15 dark:text-white"
              aria-label="Open menu"
            >
              <Menu size={19} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold tracking-tightest sm:text-lg">
                {nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
                  ? t(
                      nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))).label,
                      nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))).hi
                    )
                  : 'Ftech Office'}
              </p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                {user?.name} · {user?.employeeId}
                {user?.department ? ` · ${user.department.name}` : ''}
              </p>
            </div>

            <button
              onClick={toggleHindi}
              title="Hindi labels / हिंदी"
              className={clsx(
                'hidden h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition sm:flex',
                hindi
                  ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                  : 'border-ink-200 text-ink-500 hover:border-black hover:text-black dark:border-white/15 dark:text-ink-400 dark:hover:border-white dark:hover:text-white'
              )}
            >
              <Languages size={16} />
              {hindi ? 'हिंदी' : 'EN'}
            </button>

            <button
              onClick={toggleTheme}
              className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-black transition hover:border-black hover:bg-ink-100 dark:border-white/15 dark:text-white dark:hover:border-white dark:hover:bg-white/10"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="relative hidden sm:block">
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2 rounded-xl border border-ink-200 py-1.5 pl-1.5 pr-2.5 transition hover:border-black hover:bg-ink-100 dark:border-white/15 dark:hover:border-white dark:hover:bg-white/10"
              >
                <Avatar name={user?.name} size={30} />
                <ChevronDown size={15} className="text-ink-400" />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-56 animate-fade-up overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl dark:border-white/15 dark:bg-black">
                    <div className="border-b border-ink-200 px-4 py-3 dark:border-white/12">
                      <p className="truncate text-sm font-semibold">{user?.name}</p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">{roleLabel}</p>
                    </div>
                    <button
                      onClick={() => navigate('/settings')}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-ink-100 dark:hover:bg-white/10"
                    >
                      <Settings size={15} /> Settings
                    </button>
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom bar ─────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 backdrop-blur-xl lg:hidden dark:border-white/12 dark:bg-black/95">
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition-all duration-200',
                  isActive ? 'scale-105 text-black dark:text-white' : 'text-ink-500 dark:text-ink-400'
                )
              }
            >
              <item.icon size={21} />
              <span className="truncate">{t(item.label, item.hi)}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setDrawer(true)}
            className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold text-ink-500 dark:text-ink-400"
          >
            <Menu size={21} />
            More
          </button>
        </div>
      </nav>
      {rest.length === 0 && null}
    </div>
  );
}

function NavItem({ item, label }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => clsx('nav-link', isActive && 'nav-link-active')}
    >
      <item.icon size={18} className="shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function Brand({ onClose }) {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <LogoMark size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-bold leading-tight tracking-tightest">Ftech Computers</p>
        <p className="truncate text-[11px] font-medium text-ink-500 dark:text-ink-400">Office Management</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="text-ink-400 lg:hidden">
          <X size={18} />
        </button>
      )}
    </div>
  );
}

function UserCard({ user, roleLabel, onLogout }) {
  return (
    <div className="border-t border-ink-200 p-3 dark:border-white/12">
      <div className="flex items-center gap-3 rounded-xl bg-ink-100 p-3 dark:bg-white/8">
        <Avatar name={user?.name} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="truncate text-[11px] text-ink-500 dark:text-ink-400">{roleLabel}</p>
        </div>
        <button
          onClick={onLogout}
          title="Sign out"
          className="rounded-lg p-2 text-ink-400 transition hover:bg-rose-500/10 hover:text-rose-500"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}
