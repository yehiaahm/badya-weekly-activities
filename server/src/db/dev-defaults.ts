/**
 * Development-only staff account, created automatically when no admin exists
 * and ADMIN_EMAIL / ADMIN_PASSWORD are not set. Never used in production —
 * production refuses to invent credentials. The same values are listed in
 * .env.example so they can be changed in one place.
 */
export const DEV_ADMIN = {
  name: 'Sports Office Admin',
  email: 'sports.admin@badyauni.edu.eg',
  password: 'BadyaSports#2026',
};
