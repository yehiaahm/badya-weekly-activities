import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityDTO,
  ActivityListResponse,
  MyReservationDTO,
  PublicConfig,
  ReservationConfirmationDTO,
  SessionUser,
  StudentProfileDTO,
} from '@shared/types.ts';
import type { StudentDetailsInput } from '@shared/validation.ts';
import { api, query } from './api.ts';

/** Seat counts and statuses refresh on their own, so "Full" / "Registration Closed" appear without reloading. */
const LIVE_REFRESH_MS = 30_000;

export const keys = {
  config: ['config'] as const,
  session: ['session'] as const,
  activities: (month: string) => ['activities', month] as const,
  activity: (id: number) => ['activity', id] as const,
  myReservations: ['me', 'reservations'] as const,
};

export function useConfig() {
  return useQuery({
    queryKey: keys.config,
    queryFn: () => api.get<PublicConfig>('/config'),
    staleTime: 5 * 60_000,
  });
}

export interface SessionState {
  admin: SessionUser | null;
  student: SessionUser | null;
}

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: () => api.get<SessionState>('/auth/session'),
    staleTime: 60_000,
  });
}

export function usePublicActivities(month: string) {
  return useQuery({
    queryKey: keys.activities(month),
    queryFn: () => api.get<ActivityListResponse>(`/activities${query({ month })}`),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

/** Activities for several months at once (a week can straddle two months). */
export function usePublicActivitiesForMonths(months: string[]) {
  return useQueries({
    queries: months.map((month) => ({
      queryKey: keys.activities(month),
      queryFn: () => api.get<ActivityListResponse>(`/activities${query({ month })}`),
      refetchInterval: LIVE_REFRESH_MS,
    })),
    combine: (results) => ({
      activities: results.flatMap((result) => result.data?.activities ?? []),
      isPending: results.some((result) => result.isPending),
      error: results.find((result) => result.error)?.error ?? null,
      refetch: () => results.forEach((result) => void result.refetch()),
    }),
  });
}

export function usePublicActivity(id: number) {
  return useQuery({
    queryKey: keys.activity(id),
    queryFn: () => api.get<ActivityDTO>(`/activities/${id}`),
    refetchInterval: LIVE_REFRESH_MS,
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}

export function useReserve(activityId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (details: StudentDetailsInput) =>
      api.post<ReservationConfirmationDTO>(`/activities/${activityId}/reservations`, details),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['activities'] });
      void client.invalidateQueries({ queryKey: keys.activity(activityId) });
      void client.invalidateQueries({ queryKey: keys.myReservations });
    },
  });
}

export interface MyReservationsResponse {
  student: StudentProfileDTO;
  reservations: MyReservationDTO[];
}

export function useMyReservations(enabled: boolean) {
  return useQuery({
    queryKey: keys.myReservations,
    queryFn: () => api.get<MyReservationsResponse>('/me/reservations'),
    enabled,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useCancelMyReservation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reservationId: number) => api.post<void>(`/me/reservations/${reservationId}/cancel`),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.myReservations });
      void client.invalidateQueries({ queryKey: ['activities'] });
      void client.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useRequestCode() {
  return useMutation({
    mutationFn: (email: string) => api.post<{ message: string; devCode?: string }>('/auth/student/request-code', { email }),
  });
}

export function useVerifyCode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; code: string }) => api.post<{ user: SessionUser }>('/auth/student/verify', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.session });
      void client.invalidateQueries({ queryKey: keys.myReservations });
    },
  });
}

export function useStudentLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/student/logout'),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.myReservations });
      void client.invalidateQueries({ queryKey: keys.session });
    },
  });
}
