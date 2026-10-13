import type { ActivityStatus, AttendanceStatus, ReservationStatus, StoredStatus } from './status.ts';

/** Shapes returned by the HTTP API. Shared so the client and server can't drift apart. */

export interface PublicConfig {
  appName: string;
  timeZone: string;
  now: string;
  today: string;
  workingDays: readonly number[];
  workdayStart: string;
  workdayEnd: string;
  registrationLeadHours: number;
  emailDomains: string[];
  academicLevels: readonly string[];
  majorSuggestions: string[];
}

export interface ActivityDTO {
  id: number;
  name: string;
  category: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  coach: string;
  capacity: number;
  registeredCount: number;
  availableSeats: number;
  status: ActivityStatus;
  storedStatus: StoredStatus;
  registrationDeadline: string;
  canReserve: boolean;
}

export interface AdminActivityDTO extends ActivityDTO {
  presentCount: number;
  absentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityListResponse<T extends ActivityDTO = ActivityDTO> {
  month: string;
  now: string;
  activities: T[];
}

export interface StudentProfileDTO {
  id: number;
  name: string;
  studentId: string;
  major: string;
  academicLevel: string;
  phone: string;
  email: string;
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'student';
  student: StudentProfileDTO | null;
}

export interface ReservationSummaryDTO {
  id: number;
  code: string;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
}

export interface ReservationConfirmationDTO {
  reservation: ReservationSummaryDTO;
  activity: ActivityDTO;
  student: { name: string; studentId: string; email: string };
}

export interface MyReservationDTO extends ReservationSummaryDTO {
  activity: ActivityDTO;
  attendance: AttendanceStatus | null;
  canCancel: boolean;
}

export interface AdminReservationDTO extends ReservationSummaryDTO {
  source: 'student' | 'admin';
  student: StudentProfileDTO;
  attendance: AttendanceStatus | null;
}

export interface ActivityReservationsResponse {
  activity: AdminActivityDTO;
  reservations: AdminReservationDTO[];
}

export interface AttendanceRowDTO {
  studentId: number;
  name: string;
  universityId: string;
  major: string;
  reservationCode: string;
  reservationStatus: ReservationStatus;
  attendance: AttendanceStatus | null;
  markedAt: string | null;
}

export interface AttendanceResponse {
  activity: AdminActivityDTO;
  canRecord: boolean;
  reason: string | null;
  rows: AttendanceRowDTO[];
}

export interface LookupsDTO {
  categories: string[];
  locations: string[];
  coaches: string[];
  activityNames: string[];
  majors: string[];
}

export interface CopyMonthResult {
  sourceMonth: string;
  targetMonth: string;
  created: number;
  skippedExisting: number;
  skippedPast: number;
  unmapped: number;
}

export interface BulkResult {
  updated: number;
  failed: { id: number; message: string }[];
}

export interface ReportActivityRow {
  id: number;
  name: string;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  status: ActivityStatus;
  capacity: number;
  registeredCount: number;
  availableSeats: number;
  fillRate: number;
  presentCount: number;
  absentCount: number;
}

export interface CategoryBreakdown {
  category: string;
  activities: number;
  reservations: number;
  capacity: number;
  present: number;
  absent: number;
}

export interface ReportResponse {
  filters: { month: string; activity: string | null; category: string | null; date: string | null };
  totals: {
    activities: number;
    cancelledActivities: number;
    reservations: number;
    capacity: number;
    availableSeats: number;
    present: number;
    absent: number;
    attendancePending: number;
    fillRate: number;
    attendanceRate: number | null;
  };
  mostReserved: ReportActivityRow[];
  lowRegistration: ReportActivityRow[];
  fullCapacity: ReportActivityRow[];
  byCategory: CategoryBreakdown[];
  activities: ReportActivityRow[];
  lowRegistrationThreshold: number;
}

export interface DashboardResponse {
  month: string;
  now: string;
  today: string;
  counts: Record<ActivityStatus, number> & { total: number };
  reservations: number;
  capacity: number;
  upcoming: AdminActivityDTO[];
  todayActivities: AdminActivityDTO[];
  attention: {
    drafts: number;
    attendancePending: AdminActivityDTO[];
    closingSoonLowFill: AdminActivityDTO[];
  };
  workflow: {
    created: number;
    published: number;
    reservations: number;
    pastActivities: number;
    attendanceRecorded: number;
  };
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
