/**
 * Admin API client for the DEMO UI only (src/demo-ui.ts). The app that serves users (src/app.ts)
 * never imports this file: it holds back-end SDK tokens and nothing else.
 *
 * ⚠ It reuses UNLEASH_PAT, an Admin Personal Access Token. That is NOT recommended outside a demo:
 * a page that shows live rules needs read access at most, and a real app needs no admin token.
 *
 * Unlike scripts/api.ts it never exits the process: a missing token turns into an error the page
 * can show. Rate limits (429) and transient 5xx get a short retry.
 */

const env = (name: string): string => (process.env[name] ?? '').replace(/\r/g, '').trim();

export const BASE_URL = env('UNLEASH_URL').replace(/\/+$/, '').replace(/\/api$/, '');
const PAT = env('UNLEASH_PAT');
export const PROJECT = env('UNLEASH_PROJECT_ID') || 'experiments-demo';
export const adminConfigured = Boolean(BASE_URL && PAT);

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Call `/api/admin{path}`; throws AdminError on anything but 2xx. */
export const admin = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  if (!adminConfigured) throw new AdminError('UNLEASH_URL or UNLEASH_PAT missing in .env', 0);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE_URL}/api/admin${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: PAT },
      signal: AbortSignal.timeout(8000),
    });
    if (RETRYABLE.has(res.status) && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 300 * attempt);
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 300);
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? message;
      } catch {
        /* plain text */
      }
      throw new AdminError(`${init.method ?? 'GET'} /api/admin${path} → HTTP ${res.status}: ${message}`, res.status);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }
};

/** Run `load` at most once per `ttl` ms per key; callers share the in-flight promise. */
export const cached = <T>(ttl: number) => {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = load();
    entries.set(key, { at: Date.now(), value });
    value.catch(() => entries.delete(key)); // never cache a failure
    return value;
  };
};
