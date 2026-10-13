import type { AppContext } from './context.ts';
import { ActivityService } from './modules/activities/activities.service.ts';
import { AttendanceService } from './modules/attendance/attendance.service.ts';
import { AuthService } from './modules/auth/auth.service.ts';
import { DashboardService } from './modules/reports/dashboard.service.ts';
import { ReportService } from './modules/reports/reports.service.ts';
import { ReservationService } from './modules/reservations/reservations.service.ts';
import { StudentRepository } from './modules/students/students.repository.ts';

export function createServices(ctx: AppContext) {
  return {
    auth: new AuthService(ctx),
    activities: new ActivityService(ctx),
    reservations: new ReservationService(ctx),
    attendance: new AttendanceService(ctx),
    reports: new ReportService(ctx),
    dashboard: new DashboardService(ctx),
    students: new StudentRepository(ctx.db),
  };
}

export type Services = ReturnType<typeof createServices>;
