import { SearchX } from 'lucide-react';
import { createBrowserRouter, Link, useRouteError } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from './components/ui.tsx';
import { ActivityDetailPage } from './student/ActivityDetailPage.tsx';
import { ConfirmationPage } from './student/ConfirmationPage.tsx';
import { FitnessPage } from './student/FitnessPage.tsx';
import { MyReservationsPage } from './student/MyReservationsPage.tsx';
import { ReservePage } from './student/ReservePage.tsx';
import { StudentLayout } from './student/StudentLayout.tsx';
import { WeeklyActivitiesPage } from './student/WeeklyActivitiesPage.tsx';

// The admin dashboard is a separate chunk, so students on phones never download it.
const admin = () => import('./admin/index.ts');

function NotFound() {
  return (
    <div className="container page">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        action={
          <Link to="/" className="btn btn-primary">
            Go to Weekly Activities
          </Link>
        }
      >
        The page you're looking for doesn't exist.
      </EmptyState>
    </div>
  );
}

function RouteError() {
  const error = useRouteError();
  return (
    <div className="container page">
      <ErrorState error={error} onRetry={() => window.location.reload()} />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: StudentLayout,
    ErrorBoundary: RouteError,
    HydrateFallback: LoadingState,
    children: [
      { index: true, Component: WeeklyActivitiesPage },
      { path: 'activities/:id', Component: ActivityDetailPage },
      { path: 'activities/:id/reserve', Component: ReservePage },
      { path: 'reservations/confirmed', Component: ConfirmationPage },
      { path: 'my-reservations', Component: MyReservationsPage },
      { path: 'fitness', Component: FitnessPage },
      { path: '*', Component: NotFound },
    ],
  },
  {
    path: '/admin/login',
    lazy: async () => ({ Component: (await admin()).AdminLoginPage }),
    HydrateFallback: LoadingState,
  },
  {
    path: '/admin',
    lazy: async () => ({ Component: (await admin()).AdminLayout }),
    ErrorBoundary: RouteError,
    HydrateFallback: LoadingState,
    children: [
      { index: true, lazy: async () => ({ Component: (await admin()).DashboardPage }) },
      { path: 'calendar', lazy: async () => ({ Component: (await admin()).CalendarPage }) },
      { path: 'activities', lazy: async () => ({ Component: (await admin()).ActivitiesPage }) },
      { path: 'reservations', lazy: async () => ({ Component: (await admin()).ReservationsIndexPage }) },
      { path: 'attendance', lazy: async () => ({ Component: (await admin()).AttendanceIndexPage }) },
      { path: 'reports', lazy: async () => ({ Component: (await admin()).ReportsPage }) },
      { path: 'activities/:id/reservations', lazy: async () => ({ Component: (await admin()).ActivityReservationsPage }) },
      { path: 'activities/:id/attendance', lazy: async () => ({ Component: (await admin()).ActivityAttendancePage }) },
      { path: '*', Component: NotFound },
    ],
  },
]);
