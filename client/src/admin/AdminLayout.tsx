import {
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  ExternalLink,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { BrandLockup, BrandMark } from '../components/Brand.tsx';
import { LoadingState } from '../components/ui.tsx';
import { useSession } from '../lib/queries.ts';
import { useAdminLogout } from './queries.ts';
import { useAdminMonth } from './useAdminMonth.ts';

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean; match?: RegExp }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/calendar', label: 'Monthly Calendar', icon: CalendarDays },
  { to: '/admin/activities', label: 'Activities', icon: ListChecks, end: true },
  { to: '/admin/reservations', label: 'Reservations', icon: Ticket, match: /^\/admin\/activities\/\d+\/reservations/ },
  { to: '/admin/attendance', label: 'Attendance', icon: ClipboardCheck, match: /^\/admin\/activities\/\d+\/attendance/ },
  { to: '/admin/reports', label: 'Reports', icon: ChartColumn },
];

export function AdminLayout() {
  const session = useSession();
  const location = useLocation();
  const [month] = useAdminMonth();
  const [navOpen, setNavOpen] = useState(false);
  const logout = useAdminLogout();

  useEffect(() => setNavOpen(false), [location.pathname]);

  if (session.isPending) return <LoadingState />;
  const admin = session.data?.admin;
  if (!admin) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?next=${next}`} replace />;
  }

  return (
    <div className="admin-shell">
      <ScrollRestoration getKey={(location) => location.pathname} />
      <aside className={`admin-sidebar ${navOpen ? 'is-open' : ''}`} aria-label="Admin navigation">
        <Link to={`/admin?month=${month}`} className="brand">
          <BrandLockup subtitle="Sports Office Admin" />
        </Link>
        <nav className="admin-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={{ pathname: item.to, search: `?month=${month}` }}
              end={item.end}
              className={({ isActive }) => (isActive || item.match?.test(location.pathname) ? 'active' : undefined)}
            >
              <item.icon size={18} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>
            <strong>{admin.name}</strong>
            <div style={{ overflowWrap: 'anywhere' }}>{admin.email}</div>
          </div>
          <a href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Open student site
          </a>
          <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}

      <div className="admin-main">
        <div className="mobile-topbar">
          <button type="button" className="icon-btn" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <BrandMark size={34} />
          <span className="topbar-title">
            <strong>The Games for Badya</strong>
            <small>Sports Office Admin</small>
          </span>
        </div>
        <main className="admin-content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
