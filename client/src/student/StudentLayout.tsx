import { CalendarDays, Flame, Ticket } from 'lucide-react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { BrandLockup, BrandMark } from '../components/Brand.tsx';

export function StudentLayout() {
  const { pathname } = useLocation();
  const browsing = pathname === '/' || pathname.startsWith('/activities') || pathname.startsWith('/reservations');
  const navClass = (active: boolean) => (active ? 'active' : undefined);

  return (
    <div className="student-shell">
      <ScrollRestoration getKey={(location) => location.pathname} />
      <header className="student-header">
        <div className="container header-inner">
          <Link to="/" className="brand" aria-label="SAC Sports Hub – Weekly Activities home">
            <BrandLockup />
          </Link>
          <nav className="student-nav desktop-only" aria-label="Main">
            <NavLink to="/" className={() => navClass(browsing)}>
              <CalendarDays size={17} /> Weekly Activities
            </NavLink>
            <NavLink to="/fitness" className={({ isActive }) => navClass(isActive)}>
              <Flame size={17} /> Move Lab
            </NavLink>
            <NavLink to="/my-reservations" className={({ isActive }) => navClass(isActive)}>
              <Ticket size={17} /> My Reservations
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="student-main" id="main">
        <Outlet />
      </main>

      <footer className="student-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <BrandMark size={52} />
            <div>
              <strong>SAC Sports Hub</strong>
              <span>Student Athlete Committee · Badya University</span>
              <span className="footer-motto">Play · Unite · Inspire</span>
            </div>
          </div>
          <nav className="footer-links" aria-label="Footer">
            {/* Phones already have these two in the tab bar. */}
            <Link to="/" className="desktop-only">
              Weekly Activities
            </Link>
            <Link to="/my-reservations" className="desktop-only">
              My Reservations
            </Link>
            <Link to="/admin">Staff sign in</Link>
          </nav>
        </div>
        <div className="container footer-legal">
          © {new Date().getFullYear()} SAC Sports Hub · Powered by SAC Sports Technology
        </div>
      </footer>

      <nav className="tabbar mobile-only" aria-label="Main">
        <NavLink to="/" className={() => navClass(browsing)}>
          <CalendarDays size={22} />
          Weekly Activities
        </NavLink>
        <NavLink to="/fitness" className={({ isActive }) => navClass(isActive)}>
          <Flame size={22} />
          Move Lab
        </NavLink>
        <NavLink to="/my-reservations" className={({ isActive }) => navClass(isActive)}>
          <Ticket size={22} />
          My Reservations
        </NavLink>
      </nav>
    </div>
  );
}
