/**
 * Returns true if the Authorization header contains a valid bearer token.
 * Accepts either PIPELINE_SECRET (manual triggers) or CRON_SECRET (Vercel cron).
 */
export function isAuthorized(authHeader: string | null): boolean {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return false;
  const valid = [process.env.PIPELINE_SECRET, process.env.CRON_SECRET].filter(Boolean);
  return valid.includes(token);
}
