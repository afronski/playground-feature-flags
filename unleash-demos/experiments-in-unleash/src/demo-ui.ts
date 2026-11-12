/**
 * The demo UI: the grid page and everything that explains it. A separate process from the app,
 * because it holds an ADMIN credential (UNLEASH_PAT) to read the live rules and ask Unleash's
 * Playground why each user got what they got.
 *
 * ⚠ Reusing an Admin PAT here is NOT recommended outside a demo. The app (src/app.ts) shows the
 *   real pattern: back-end SDK token only, every flag evaluated on the server.
 *
 *   GET  /                      the grid page (public/index.html)
 *   GET  /config                app URL for the iframes, project link, environment per tab
 *   GET  /rules?tab=N           live strategies of the tab's flags (Admin API)
 *   GET  /expected?tab=N        expected share per legend entry, from those rules (src/expected.ts)
 *   POST /verdicts              {tab, users:[{userId, holdout}]} → who the holdout segment excludes and why (Playground)
 *   GET  /hash?tab=N&userId=…   the user's rollout and variant buckets (pure MurmurHash, as the SDK does it)
 *   GET  /change-requests       open change requests in production
 *   GET  /app/cell.json?…       the app's own answer for one user (proxied, for the context sample)
 *   GET  /holdout               the holdout list, proxied from the app
 *   GET  /feed                  latest impression events, proxied from the sink
 *   GET  /status                app, sink, BigQuery and Admin API state
 */
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { normalizedStrategyValue, normalizedVariantValue } from 'unleash-client/lib/strategy/util.js';
import { admin, adminConfigured, cached, AdminError, BASE_URL, PROJECT } from './admin.ts';
import { expectedShares, isConditional, type Constraint, type FlagRule, type SegmentRule, type StrategyRule, type VariantRule } from './expected.ts';
import { FLAGS, HOLDOUT, type Environment } from './flags.ts';
import { TAB_ENVIRONMENT, type Tab } from './scenarios.ts';

const PORT = Number(process.env.DEMO_UI_PORT ?? 3002);
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const SINK_URL = process.env.SINK_URL ?? 'http://localhost:3001';
const APP_NAME = process.env.APP_NAME || 'experiments-demo-app';
const PAGE = new URL('../public/index.html', import.meta.url);

const TAB_FLAGS: Record<Tab, string[]> = {
  1: [FLAGS.rollout],
  2: [FLAGS.allocation, FLAGS.experimentA, FLAGS.experimentB],
  3: [FLAGS.rollout, FLAGS.allocation, FLAGS.experimentA, FLAGS.experimentB],
  4: [FLAGS.allocation, FLAGS.experimentA, FLAGS.experimentB],
};

let lastAdminError: string | null = null;
const track = async <T>(work: Promise<T>): Promise<T> => {
  try {
    const value = await work;
    lastAdminError = null;
    return value;
  } catch (error) {
    lastAdminError = error instanceof Error ? error.message : String(error);
    throw error;
  }
};

// ── Live rules from the Admin API ────────────────────────────────────────────────────────────────

interface AdminVariant {
  name: string;
  weight: number;
  stickiness?: string;
  payload?: { type: string; value: string };
}
interface AdminStrategy {
  id?: string;
  name: string;
  title?: string | null;
  disabled?: boolean | null;
  parameters?: Record<string, string>;
  constraints?: Constraint[];
  segments?: number[];
  variants?: AdminVariant[];
}
interface AdminFeature {
  name: string;
  environments?: { name: string; enabled: boolean; strategies?: AdminStrategy[]; variants?: AdminVariant[] }[];
  dependencies?: { feature: string; variants?: string[]; enabled?: boolean }[];
}

const variantRule = (v: AdminVariant): VariantRule => {
  let payload: Record<string, string> | undefined;
  try {
    payload = v.payload?.type === 'json' ? (JSON.parse(v.payload.value) as Record<string, string>) : undefined;
  } catch {
    payload = undefined;
  }
  return { name: v.name, weight: v.weight, stickiness: v.stickiness, label: payload?.label ?? v.name, color: payload?.color, payload };
};

const segmentsCache = cached<Map<number, SegmentRule>>(2500);
const loadSegments = (): Promise<Map<number, SegmentRule>> =>
  segmentsCache('segments', async () => {
    const data = await admin<{ segments?: SegmentRule[] } | SegmentRule[]>('/segments');
    const list = Array.isArray(data) ? data : (data.segments ?? []);
    return new Map(list.map((s) => [s.id, { id: s.id, name: s.name, constraints: s.constraints ?? [] }]));
  });

const featureCache = cached<AdminFeature>(2500);
const loadFeature = (flag: string): Promise<AdminFeature> =>
  featureCache(flag, () => admin<AdminFeature>(`/projects/${encodeURIComponent(PROJECT)}/features/${encodeURIComponent(flag)}`));

const toFlagRule = (feature: AdminFeature, environment: Environment, segments: Map<number, SegmentRule>): FlagRule => {
  const env = feature.environments?.find((e) => e.name === environment);
  const strategies: StrategyRule[] = (env?.strategies ?? []).map((s) => {
    const p = s.parameters ?? {};
    return {
      id: s.id,
      name: s.name,
      title: s.title ?? undefined,
      disabled: Boolean(s.disabled),
      rollout: s.name === 'flexibleRollout' || s.name === 'gradualRolloutUserId' ? Number(p.rollout ?? p.percentage ?? 100) : 100,
      groupId: p.groupId ?? feature.name,
      stickiness: p.stickiness ?? 'default',
      constraints: s.constraints ?? [],
      segments: (s.segments ?? []).map((id) => segments.get(id) ?? { id, name: `segment #${id}`, constraints: [] }),
      variants: (s.variants ?? []).map(variantRule),
    };
  });
  return {
    name: feature.name,
    environment,
    enabled: Boolean(env?.enabled),
    strategies,
    variants: (env?.variants ?? []).map(variantRule),
    dependencies: feature.dependencies ?? [],
  };
};

const loadRules = async (tab: Tab): Promise<Record<string, FlagRule>> => {
  const environment = TAB_ENVIRONMENT[tab];
  const [segments, ...features] = await track(Promise.all([loadSegments(), ...TAB_FLAGS[tab].map(loadFeature)]));
  return Object.fromEntries(features.map((f) => [f.name, toFlagRule(f, environment, segments)]));
};

// ── Playground verdicts: who does the holdout segment exclude, and which constraint did it? ──────

interface PlaygroundConstraint {
  contextName: string;
  operator: string;
  values?: string[];
  value?: string;
  inverted?: boolean;
  result: boolean;
}
interface PlaygroundRow {
  context?: Record<string, unknown> & { userId?: string; properties?: Record<string, string> };
  isEnabled: boolean;
  variant?: { name: string; enabled: boolean } | null;
  strategies?: { result: unknown; data?: { segments?: { name: string; result: boolean; constraints?: PlaygroundConstraint[] }[] }[] };
}
interface PlaygroundResponse {
  features: { name: string; environments: Record<string, PlaygroundRow[]> }[];
}

export interface Verdict {
  excluded: boolean;
  /** Why the holdout segment said no, one entry per failing constraint. */
  reasons: { kind: 'list' | 'userId' | 'other'; text: string }[];
  /** Whether the segment was found on any strategy at all. */
  segmentSeen: boolean;
  flags: Record<string, { enabled: boolean; variant: string | null }>;
}

const describe = (c: PlaygroundConstraint): Verdict['reasons'][number] => {
  const op = `${c.inverted ? 'NOT ' : ''}${c.operator}`;
  const values = c.values?.length ? `[${c.values.join(', ')}]` : (c.value ?? '');
  if (c.contextName === HOLDOUT.contextField) return { kind: 'list', text: `holdout=true · ${c.contextName} ${op} ${values}` };
  if (c.contextName === 'userId') return { kind: 'userId', text: `userId rule · userId ${op} ${values}` };
  return { kind: 'other', text: `${c.contextName} rule · ${c.contextName} ${op} ${values}` };
};

const playgroundCache = cached<PlaygroundResponse>(1000);

const verdicts = async (tab: Tab, users: { userId: string; holdout: boolean }[]): Promise<Record<string, Verdict>> => {
  const environment = TAB_ENVIRONMENT[tab];
  const ids = [...new Set(users.map((u) => u.userId.replace(/,/g, '').trim()).filter(Boolean))];
  const want = new Map(users.map((u) => [u.userId.replace(/,/g, '').trim(), String(u.holdout)]));
  const body = {
    environments: [environment],
    projects: [PROJECT],
    // Comma-separated values: Unleash evaluates every combination (users × holdout true/false).
    // No sessionId here: it would multiply the combinations, and stickiness is userId anyway.
    context: { appName: APP_NAME, userId: ids.join(','), properties: { [HOLDOUT.contextField]: 'true,false' } },
  };
  const data = await track(
    playgroundCache(JSON.stringify(body), () => admin<PlaygroundResponse>('/playground/advanced', { method: 'POST', body: JSON.stringify(body) })),
  );

  const out: Record<string, Verdict> = Object.fromEntries(ids.map((id) => [id, { excluded: false, reasons: [], segmentSeen: false, flags: {} }]));
  for (const feature of data.features ?? []) {
    for (const row of feature.environments?.[environment] ?? []) {
      const ctx = row.context ?? {};
      const userId = String(ctx.userId ?? '');
      const holdout = String(ctx.properties?.[HOLDOUT.contextField] ?? ctx[HOLDOUT.contextField] ?? '');
      const verdict = out[userId];
      if (!verdict || want.get(userId) !== holdout) continue; // keep the combination the page uses
      verdict.flags[feature.name] = { enabled: row.isEnabled, variant: row.variant?.enabled ? row.variant.name : null };
      for (const strategy of row.strategies?.data ?? []) {
        for (const segment of strategy.segments ?? []) {
          if (segment.name !== HOLDOUT.segment) continue;
          verdict.segmentSeen = true;
          if (segment.result) continue;
          verdict.excluded = true;
          for (const c of segment.constraints ?? []) {
            if (c.result) continue;
            const reason = describe(c);
            if (!verdict.reasons.some((r) => r.text === reason.text)) verdict.reasons.push(reason);
          }
        }
      }
    }
  }
  return out;
};

// ── Hash buckets, as the Node SDK computes them ──────────────────────────────────────────────────

const hashes = async (tab: Tab, userId: string) => {
  const rules = await loadRules(tab);
  return TAB_FLAGS[tab].map((name) => {
    const flag = rules[name];
    const strategy = flag?.strategies.find((s) => !s.disabled && !isConditional(s)) ?? flag?.strategies.find((s) => !s.disabled);
    if (!flag || !strategy) return { flag: name, enabled: Boolean(flag?.enabled), strategy: null };
    // Stickiness userId (or default, which uses userId first); the app sets sessionId = userId too.
    const bucket = normalizedStrategyValue(userId, strategy.groupId);
    const variants = strategy.variants.length > 0 ? strategy.variants : flag.variants;
    const variantGroup = strategy.variants.length > 0 ? strategy.groupId : flag.name;
    const total = variants.reduce((sum, v) => sum + Math.max(v.weight, 0), 0);
    let from = 1;
    const bands = variants
      .filter((v) => v.weight > 0)
      .map((v) => {
        const band = { name: v.name, label: v.label, color: v.color ?? null, from, to: from + v.weight - 1 };
        from += v.weight;
        return band;
      });
    const variantBucket = total > 0 ? normalizedVariantValue(userId, variantGroup, total) : null;
    return {
      flag: name,
      enabled: flag.enabled,
      strategy: { name: strategy.name, title: strategy.title ?? null, groupId: strategy.groupId, stickiness: strategy.stickiness, rollout: strategy.rollout, conditional: isConditional(strategy) },
      bucket,
      inRollout: bucket <= strategy.rollout,
      variantGroup,
      total,
      variantBucket,
      bands,
      variant: variantBucket === null ? null : (bands.find((b) => variantBucket <= b.to)?.name ?? null),
    };
  });
};

// ── Change requests in production ────────────────────────────────────────────────────────────────

interface ChangeRequestItem {
  id: number;
  title?: string;
  state: string;
  environment?: string;
  features?: (string | { name: string })[];
}
const CLOSED = new Set(['Applied', 'Cancelled', 'Rejected']);
const crCache = cached<{ available: boolean; items: { id: number; title: string; state: string; features: string[]; url: string }[]; error?: string }>(2500);

const changeRequests = () =>
  crCache('production', async () => {
    let list: ChangeRequestItem[] | null = null;
    let error = '';
    for (const path of [`/projects/${encodeURIComponent(PROJECT)}/change-requests`, `/search/change-requests?project=${encodeURIComponent(PROJECT)}`]) {
      try {
        const data = await admin<ChangeRequestItem[] | { changeRequests?: ChangeRequestItem[] }>(path);
        list = Array.isArray(data) ? data : (data.changeRequests ?? []);
        break;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    if (!list) return { available: false, items: [], error };
    const items = list
      .filter((cr) => !CLOSED.has(cr.state) && (cr.environment ?? 'production') === 'production')
      .map((cr) => ({
        id: cr.id,
        title: cr.title ?? `Change request #${cr.id}`,
        state: cr.state,
        features: (cr.features ?? []).map((f) => (typeof f === 'string' ? f : f.name)),
        url: `${BASE_URL}/projects/${PROJECT}/change-requests/${cr.id}`,
      }));
    return { available: true, items };
  });

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────

const send = (res: ServerResponse, code: number, type: string, body: string): void => {
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(body);
};
const json = (res: ServerResponse, code: number, body: unknown): void => send(res, code, 'application/json', JSON.stringify(body));
const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64_000) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};
const proxy = async (res: ServerResponse, url: string, label: string): Promise<void> => {
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return send(res, upstream.status, 'application/json', await upstream.text());
  } catch {
    return json(res, 502, { error: `${label} unreachable` });
  }
};
const adminFailure = (res: ServerResponse, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  json(res, error instanceof AdminError && error.status === 0 ? 503 : 502, { error: message });
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const tab = Number(url.searchParams.get('tab')) as Tab;
  const validTab = [1, 2, 3, 4].includes(tab);

  try {
    if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, 'text/html', await readFile(PAGE, 'utf8'));

    if (url.pathname === '/config') {
      return json(res, 200, {
        appUrl: APP_URL,
        project: PROJECT,
        unleash: BASE_URL ? `${BASE_URL}/projects/${PROJECT}` : null,
        tabEnvironment: TAB_ENVIRONMENT,
        holdoutSegment: HOLDOUT.segment,
        adminConfigured,
      });
    }

    if (url.pathname === '/rules') {
      if (!validTab) return json(res, 400, { error: 'tab=1..4 is required' });
      try {
        const rules = await loadRules(tab);
        return json(res, 200, { environment: TAB_ENVIRONMENT[tab], flags: TAB_FLAGS[tab].map((f) => rules[f]).filter(Boolean) });
      } catch (error) {
        return adminFailure(res, error);
      }
    }

    if (url.pathname === '/expected') {
      if (!validTab) return json(res, 400, { error: 'tab=1..4 is required' });
      try {
        return json(res, 200, expectedShares(tab, await loadRules(tab)));
      } catch (error) {
        return adminFailure(res, error);
      }
    }

    if (url.pathname === '/verdicts' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { tab?: number; users?: { userId?: unknown; holdout?: unknown }[] };
      const t = Number(body.tab) as Tab;
      if (![1, 2, 3, 4].includes(t) || !Array.isArray(body.users)) return json(res, 400, { error: 'tab and users[] are required' });
      const users = body.users.slice(0, 100).map((u) => ({ userId: String(u.userId ?? '').slice(0, 64), holdout: u.holdout === true }));
      try {
        return json(res, 200, { environment: TAB_ENVIRONMENT[t], verdicts: await verdicts(t, users) });
      } catch (error) {
        return adminFailure(res, error);
      }
    }

    if (url.pathname === '/hash') {
      const userId = (url.searchParams.get('userId') ?? '').trim().slice(0, 64);
      if (!validTab || !userId) return json(res, 400, { error: 'tab=1..4 and userId are required' });
      try {
        return json(res, 200, { userId, environment: TAB_ENVIRONMENT[tab], flags: await hashes(tab, userId) });
      } catch (error) {
        return adminFailure(res, error);
      }
    }

    if (url.pathname === '/change-requests') return json(res, 200, await changeRequests());

    if (url.pathname === '/app/cell.json') {
      const q = new URLSearchParams();
      for (const key of ['tab', 'userId', 'holdout']) {
        const value = url.searchParams.get(key);
        if (value !== null) q.set(key, value);
      }
      return proxy(res, `${APP_URL}/cell.json?${q}`, `app at ${APP_URL}`);
    }
    if (url.pathname === '/holdout') return proxy(res, `${APP_URL}/holdout`, `app at ${APP_URL}`);
    if (url.pathname === '/feed') return proxy(res, `${SINK_URL}/recent?limit=${Number(url.searchParams.get('limit') ?? 40) || 40}`, `sink at ${SINK_URL}`);

    if (url.pathname === '/status') {
      const get = async (u: string): Promise<unknown> => {
        try {
          return await (await fetch(u, { signal: AbortSignal.timeout(3000) })).json();
        } catch {
          return 'unreachable';
        }
      };
      const [app, sink] = await Promise.all([get(`${APP_URL}/health`), get(`${SINK_URL}/health`)]);
      return json(res, 200, {
        app,
        sink,
        admin: !adminConfigured ? 'not configured' : lastAdminError ? `error: ${lastAdminError}` : 'ok',
        unleash: BASE_URL ? `${BASE_URL}/projects/${PROJECT}` : null,
      });
    }

    return send(res, 404, 'text/plain', 'Not found');
  } catch (error) {
    console.error('[demo-ui]', error);
    return send(res, 500, 'text/plain', 'Internal error');
  }
});

server.listen(PORT, () => {
  console.log(`[demo-ui] http://localhost:${PORT}  (grid page; Admin API via UNLEASH_PAT — demo only)`);
  if (!adminConfigured) console.warn('[demo-ui] UNLEASH_URL or UNLEASH_PAT missing: live rules and verdicts are off');
});
