import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StoredStatus } from '@shared/status.ts';
import type {
  ActivityListResponse,
  ActivityReservationsResponse,
  AdminActivityDTO,
  AttendanceResponse,
  BulkResult,
  CopyMonthResult,
  DashboardResponse,
  LookupsDTO,
  ReportResponse,
  ReservationConfirmationDTO,
  SessionUser,
  StudentProfileDTO,
} from '@shared/types.ts';
import type { StudentDetailsInput } from '@shared/validation.ts';
import type { AttendanceStatus } from '@shared/status.ts';
import { api, query } from '../lib/api.ts';
import { keys } from '../lib/queries.ts';

export interface ActivityInput {
  name: string;
  category: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  coach: string;
  capacity: number | string;
  status?: StoredStatus;
}

export interface ReportFilters {
  month: string;
  activity?: string;
  category?: string;
  date?: string;
}

export const adminKeys = {
  all: ['admin'] as const,
  dashboard: (month: string) => ['admin', 'dashboard', month] as const,
  activities: (month: string) => ['admin', 'activities', month] as const,
  activity: (id: number) => ['admin', 'activity', id] as const,
  reservations: (id: number) => ['admin', 'reservations', id] as const,
  attendance: (id: number) => ['admin', 'attendance', id] as const,
  report: (filters: ReportFilters) => ['admin', 'report', filters] as const,
  lookups: ['admin', 'lookups'] as const,
};

/** Admin screens refresh on their own too, so reservations made by students show up live. */
const ADMIN_REFRESH_MS = 30_000;

/** Every admin write can change counts shown elsewhere, so refresh admin + public views. */
function useInvalidateAll() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: adminKeys.all });
    void client.invalidateQueries({ queryKey: ['activities'] });
    void client.invalidateQueries({ queryKey: ['activity'] });
  };
}

// ------------------------------------------------------------------ auth

export function useAdminLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<{ user: SessionUser }>('/auth/admin/login', body),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.session }),
  });
}

export function useAdminLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/admin/logout'),
    onSuccess: () => {
      client.removeQueries({ queryKey: adminKeys.all });
      void client.invalidateQueries({ queryKey: keys.session });
    },
  });
}

// ----------------------------------------------------------------- reads

export function useDashboard(month: string) {
  return useQuery({
    queryKey: adminKeys.dashboard(month),
    queryFn: () => api.get<DashboardResponse>(`/admin/dashboard${query({ month })}`),
    refetchInterval: ADMIN_REFRESH_MS,
  });
}

export function useAdminActivities(month: string) {
  return useQuery({
    queryKey: adminKeys.activities(month),
    queryFn: () => api.get<ActivityListResponse<AdminActivityDTO>>(`/admin/activities${query({ month })}`),
    refetchInterval: ADMIN_REFRESH_MS,
  });
}

export function useLookups() {
  return useQuery({
    queryKey: adminKeys.lookups,
    queryFn: () => api.get<LookupsDTO>('/admin/lookups'),
    staleTime: 5 * 60_000,
  });
}

export function useActivityReservations(id: number) {
  return useQuery({
    queryKey: adminKeys.reservations(id),
    queryFn: () => api.get<ActivityReservationsResponse>(`/admin/activities/${id}/reservations`),
    refetchInterval: ADMIN_REFRESH_MS,
  });
}

export function useAttendance(id: number) {
  return useQuery({
    queryKey: adminKeys.attendance(id),
    queryFn: () => api.get<AttendanceResponse>(`/admin/activities/${id}/attendance`),
  });
}

export function useReport(filters: ReportFilters) {
  return useQuery({
    queryKey: adminKeys.report(filters),
    queryFn: () => api.get<ReportResponse>(`/admin/reports${query({ ...filters })}`),
    refetchInterval: ADMIN_REFRESH_MS,
    // Changing a filter keeps the current charts on screen (dimmed) instead of flashing a loader.
    placeholderData: keepPreviousData,
  });
}

export function searchStudents(q: string) {
  return api.get<{ students: StudentProfileDTO[] }>(`/admin/students${query({ q })}`);
}

// ---------------------------------------------------------------- writes

export const SAVE_ACTIVITY_KEY = ['admin', 'save-activity'] as const;

export function useSaveActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationKey: SAVE_ACTIVITY_KEY,
    mutationFn: ({ id, values }: { id?: number; values: Partial<ActivityInput> }) =>
      id ? api.patch<AdminActivityDTO>(`/admin/activities/${id}`, values) : api.post<AdminActivityDTO>('/admin/activities', values),
    onSettled: invalidate,
  });
}

export function useDeleteActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/admin/activities/${id}`),
    onSettled: invalidate,
  });
}

export function useDuplicateActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, dates }: { id: number; dates: string[] }) =>
      api.post<{ created: AdminActivityDTO[]; skipped: { date: string; reason: string }[] }>(`/admin/activities/${id}/duplicate`, {
        dates,
      }),
    onSettled: invalidate,
  });
}

export function useSetStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { ids: number[]; status: StoredStatus }) => api.post<BulkResult>('/admin/activities/status', body),
    onSettled: invalidate,
  });
}

export function useCopyPreviousMonth() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (month: string) => api.post<CopyMonthResult>(`/admin/months/${month}/copy-previous`),
    onSettled: invalidate,
  });
}

export function usePublishMonth() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (month: string) => api.post<BulkResult>(`/admin/months/${month}/publish`),
    onSettled: invalidate,
  });
}

export function useManualRegister(activityId: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: StudentDetailsInput & { overrideDeadline: boolean }) =>
      api.post<ReservationConfirmationDTO>(`/admin/activities/${activityId}/reservations`, body),
    onSettled: invalidate,
  });
}

export function useAdminCancelReservation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (reservationId: number) => api.post<void>(`/admin/reservations/${reservationId}/cancel`),
    onSettled: invalidate,
  });
}

export function useRecordAttendance(activityId: number) {
  const client = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (entries: { studentId: number; status: AttendanceStatus | null }[]) =>
      api.put<AttendanceResponse>(`/admin/activities/${activityId}/attendance`, { entries }),
    // Optimistic update: the toggle responds instantly and rolls back on error.
    onMutate: async (entries) => {
      await client.cancelQueries({ queryKey: adminKeys.attendance(activityId) });
      const previous = client.getQueryData<AttendanceResponse>(adminKeys.attendance(activityId));
      if (previous) {
        const changes = new Map(entries.map((entry) => [entry.studentId, entry.status]));
        client.setQueryData<AttendanceResponse>(adminKeys.attendance(activityId), {
          ...previous,
          rows: previous.rows.map((row) => (changes.has(row.studentId) ? { ...row, attendance: changes.get(row.studentId) ?? null } : row)),
        });
      }
      return { previous };
    },
    onError: (_error, _entries, context) => {
      if (context?.previous) client.setQueryData(adminKeys.attendance(activityId), context.previous);
    },
    onSuccess: (data) => client.setQueryData(adminKeys.attendance(activityId), data),
    onSettled: invalidate,
  });
}
