/**
 * Thin Unleash Admin API client, adapted from the FeatureOps workshop provisioner
 * (workshop-featureops-for-platform-engineers/support/infrastructure/unleash-provisioner/src/api.ts).
 *
 * It never throws on HTTP errors: callers get `{status, data}` back and decide what a 409 or 404
 * means, which keeps provisioning idempotent. Rate limits (429) and transient 5xx get retried.
 */

const trim = (value: string): string => value.replace(/\r/g, '').trim();

export const readEnv = (name: string): string => trim(process.env[name] ?? '');

export const requireEnv = (name: string, hint = ''): string => {
  const value = readEnv(name);
  if (value === '') {
    console.error(`Missing ${name} in .env (see .env.example).${hint ? ` ${hint}` : ''}`);
    process.exit(1);
  }
  return value;
};

/** Everything before /api, e.g. https://us.app.unleash-hosted.com/abcd1234. */
export const BASE_URL = requireEnv('UNLEASH_URL').replace(/\/+$/, '').replace(/\/api$/, '');
export const PAT = requireEnv('UNLEASH_PAT', 'Create a Personal Access Token in Unleash (Profile → Personal API tokens).');
export const PROJECT = readEnv('UNLEASH_PROJECT_ID') || 'experiments-demo';

export interface ApiResponse<T> {
  status: number;
  data: T;
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 6;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const request = async <T>(prefix: string, path: string, options: RequestInit, token: string): Promise<ApiResponse<T>> => {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${BASE_URL}${prefix}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: token },
    });

    if (RETRYABLE.has(response.status) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1);
      console.warn(`  … ${options.method ?? 'GET'} ${path} → HTTP ${response.status}, retrying in ${wait} ms`);
      await sleep(wait);
      continue;
    }

    const text = await response.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }
    return { status: response.status, data };
  }
};

/** Call `/api/admin{path}` with the PAT. */
export const admin = <T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> =>
  request<T>('/api/admin', path, options, PAT);

/** Call `/api/client{path}` with an SDK token (used to check backend tokens). */
export const client = <T = unknown>(path: string, token: string): Promise<ApiResponse<T>> =>
  request<T>('/api/client', path, {}, token);

export const ok = (status: number): boolean => status >= 200 && status < 300;

/** Stop the script with a readable message when a call that must succeed did not. */
export const expectOk = <T>(what: string, response: ApiResponse<T>, alsoOk: number[] = []): ApiResponse<T> => {
  if (!ok(response.status) && !alsoOk.includes(response.status)) {
    console.error(`✗ ${what} failed (HTTP ${response.status}):`, JSON.stringify(response.data));
    process.exit(1);
  }
  return response;
};

export const json = (body: unknown): RequestInit['body'] => JSON.stringify(body);
