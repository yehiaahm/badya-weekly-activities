import { z } from 'zod';
import { isValidISODate, isValidTime, timeToMinutes } from './dates.ts';
import { isWorkingDay, WORKDAY_END, WORKDAY_START } from './calendar.ts';
import { ACADEMIC_LEVELS, MAX_ACTIVITY_CAPACITY } from './constants.ts';
import { ATTENDANCE_STATUSES, STORED_STATUSES } from './status.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STUDENT_ID_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
const PHONE_RE = /^\+?\d{8,15}$/;

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

/** Accepts the domain itself and its sub-domains (e.g. students.badyauni.edu.eg). */
export function emailMatchesDomains(email: string, domains: readonly string[]): boolean {
  if (domains.length === 0) return true;
  const host = email.split('@')[1]?.toLowerCase() ?? '';
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .regex(EMAIL_RE, 'Enter a valid email address');

export function universityEmailSchema(domains: readonly string[]) {
  return emailSchema.refine((email) => emailMatchesDomains(email, domains), {
    message: domains.length ? `Use your university email (@${domains[0]})` : 'Enter a valid email address',
  });
}

/** The academic details a student enters when reserving a spot. */
export function studentDetailsSchema(emailDomains: readonly string[]) {
  return z.object({
    fullName: z.string().trim().min(3, 'Enter your full name').max(100, 'Name is too long'),
    studentId: z
      .string()
      .trim()
      .toUpperCase()
      .regex(STUDENT_ID_RE, 'Enter a valid Student ID (letters, numbers and dashes)'),
    major: z.string().trim().min(2, 'Enter your major').max(100, 'Major is too long'),
    academicLevel: z.enum(ACADEMIC_LEVELS, { error: 'Select your academic level' }),
    phone: z
      .string()
      .transform(normalizePhone)
      .pipe(z.string().regex(PHONE_RE, 'Enter a valid phone number, e.g. 01012345678')),
    email: universityEmailSchema(emailDomains),
  });
}

export type StudentDetailsInput = z.input<ReturnType<typeof studentDetailsSchema>>;
export type StudentDetails = z.output<ReturnType<typeof studentDetailsSchema>>;

const timeSchema = z.string().refine(isValidTime, 'Use HH:MM (24-hour) format');

export const activityFieldsSchema = z.object({
  name: z.string().trim().min(2, 'Enter the activity name').max(80, 'Name is too long'),
  category: z.string().trim().min(2, 'Enter a sport or category').max(40, 'Category is too long'),
  description: z.string().trim().max(2000, 'Description is too long'),
  date: z.string().refine(isValidISODate, 'Enter a valid date'),
  startTime: timeSchema,
  endTime: timeSchema,
  location: z.string().trim().min(2, 'Enter a location').max(80, 'Location is too long'),
  coach: z.string().trim().min(2, 'Enter the coach or staff member').max(80, 'Name is too long'),
  capacity: z.coerce
    .number({ error: 'Enter a number' })
    .int('Capacity must be a whole number')
    .min(1, 'Capacity must be at least 1')
    .max(MAX_ACTIVITY_CAPACITY, `Capacity cannot exceed ${MAX_ACTIVITY_CAPACITY}`),
});

export type ActivityFields = z.output<typeof activityFieldsSchema>;

export interface FieldIssue {
  path: string;
  message: string;
}

/** Badya scheduling rules: working days only, inside 9:00 AM – 2:00 PM. */
export function scheduleIssues(values: Pick<ActivityFields, 'date' | 'startTime' | 'endTime'>): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (isValidISODate(values.date) && !isWorkingDay(values.date)) {
    issues.push({ path: 'date', message: 'Activities can only be scheduled Sunday to Thursday' });
  }
  if (isValidTime(values.startTime) && isValidTime(values.endTime)) {
    const start = timeToMinutes(values.startTime);
    const end = timeToMinutes(values.endTime);
    if (start < timeToMinutes(WORKDAY_START)) {
      issues.push({ path: 'startTime', message: 'Activities start at 9:00 AM or later' });
    }
    if (end > timeToMinutes(WORKDAY_END)) {
      issues.push({ path: 'endTime', message: 'Activities must end by 2:00 PM' });
    }
    if (end - start < 15) {
      issues.push({ path: 'endTime', message: 'End time must be at least 15 minutes after the start' });
    }
  }
  return issues;
}

export const activityCreateSchema = activityFieldsSchema
  .extend({
    description: activityFieldsSchema.shape.description.default(''),
    status: z.enum(['draft', 'published']).default('draft'),
  })
  .superRefine((values, ctx) => {
    for (const issue of scheduleIssues(values)) ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
  });

/** Partial update; the service re-validates the merged record against the schedule rules. */
export const activityUpdateSchema = activityFieldsSchema.partial().extend({
  status: z.enum(STORED_STATUSES).optional(),
});

export const bulkStatusSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  status: z.enum(STORED_STATUSES),
});

export const duplicateSchema = z.object({
  dates: z.array(z.string().refine(isValidISODate, 'Invalid date')).min(1, 'Choose at least one date').max(31),
});

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(200),
});

export const requestCodeSchema = z.object({ email: emailSchema });

export const verifyCodeSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const attendanceUpdateSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.number().int().positive(),
        status: z.enum(ATTENDANCE_STATUSES).nullable(),
      }),
    )
    .min(1)
    .max(1000),
});

/** Converts zod issues to `{ field: message }`, keeping the first message per field. */
export function fieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    errors[key] ??= issue.message;
  }
  return errors;
}
