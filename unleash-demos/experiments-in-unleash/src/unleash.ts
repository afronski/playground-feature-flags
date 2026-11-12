/**
 * Two Unleash SDK clients, one per environment, so the page can show development (use cases 1-3)
 * and production (use case 4, behind change requests) side by side.
 *
 * Every flag has impression data on, so each evaluation fires an `impression` event. We stamp it
 * with an id, time and environment and forward it in batches to the sink (src/sink.ts), which is
 * where the hand-off to BigQuery happens. Note: when a child flag checks its parent, the SDK also
 * fires an impression for the parent.
 */
import { randomUUID } from 'node:crypto';
import { InMemStorageProvider, Unleash, UnleashEvents } from 'unleash-client';
import type { ImpressionEvent } from 'unleash-client/lib/events.js';
import { ENVIRONMENTS, type Environment } from './flags.ts';

const env = (name: string, fallback = ''): string => (process.env[name] ?? fallback).replace(/\r/g, '').trim();

export const APP_NAME = env('APP_NAME', 'experiments-demo-app');
const BASE_URL = env('UNLEASH_URL').replace(/\/+$/, '').replace(/\/api$/, '');
const SINK_URL = env('SINK_URL', 'http://localhost:3001');

/** What the app sends to the sink: the SDK's impression event plus who/where/when. */
export interface ImpressionRecord extends ImpressionEvent {
  eventId: string;
  timestamp: string;
  environment: Environment;
  appName: string;
}

// ── Forward impressions to the sink in small batches ────────────────────────────────────────────

let buffer: ImpressionRecord[] = [];
let sinkDown = false;

const flush = async (): Promise<void> => {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    const res = await fetch(`${SINK_URL}/impressions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (sinkDown) console.log('[impressions] sink is back');
    sinkDown = false;
  } catch (error) {
    // Fire and forget: a demo should not stall because the sink is down. Log once per outage.
    if (!sinkDown) console.warn(`[impressions] sink at ${SINK_URL} unreachable (${String(error)}); dropping events until it is back`);
    sinkDown = true;
  }
};
setInterval(() => void flush(), 1000).unref();

// ── SDK clients ─────────────────────────────────────────────────────────────────────────────────

const clients = new Map<Environment, Unleash>();
const ready = new Set<Environment>();

for (const environment of ENVIRONMENTS) {
  const token = env(`UNLEASH_API_TOKEN_${environment.toUpperCase()}`);
  if (!BASE_URL || !token) {
    console.warn(`[unleash] UNLEASH_URL or UNLEASH_API_TOKEN_${environment.toUpperCase()} missing; run npm run provision`);
    continue;
  }

  const unleash = new Unleash({
    url: `${BASE_URL}/api/`,
    appName: APP_NAME,
    environment,
    customHeaders: { Authorization: token },
    refreshInterval: 1000, // pick up changes from the Unleash UI within a second
    metricsInterval: 5000,
    storageProvider: new InMemStorageProvider(), // two clients, so no shared backup file on disk
    skipInstanceCountWarning: true,
  });

  unleash.on(UnleashEvents.Synchronized, () => {
    ready.add(environment);
    console.log(`[unleash] ${environment}: synchronized`);
  });
  unleash.on(UnleashEvents.Error, (error: Error) => console.error(`[unleash] ${environment}: ${error.message}`));
  unleash.on(UnleashEvents.Impression, (event: ImpressionEvent) => {
    buffer.push({ ...event, eventId: randomUUID(), timestamp: new Date().toISOString(), environment, appName: APP_NAME });
  });

  clients.set(environment, unleash);
}

/** The SDK client for an environment, or undefined until it has fetched flags once. */
export const getClient = (environment: Environment): Unleash | undefined =>
  ready.has(environment) ? clients.get(environment) : undefined;

export const status = (): Record<string, string> =>
  Object.fromEntries(ENVIRONMENTS.map((e) => [e, !clients.has(e) ? 'not configured' : ready.has(e) ? 'ready' : 'connecting']));
