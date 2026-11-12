/**
 * Impression sink. Stands in for the customer's own pipeline: Unleash has no built-in BigQuery
 * connector, so the app forwards SDK impression events here and the sink lands them.
 *
 *   POST /impressions   JSON array of impression records from the app
 *   GET  /recent        newest events first (?limit=…), for the live feed on the page
 *   GET  /health        counters and where the events go
 *
 * Always appends to data/impressions.jsonl; also streams to BigQuery when BIGQUERY_* is set.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { bigQueryConfig, createBigQueryWriter, type ImpressionRow } from './bigquery.ts';
import type { ImpressionRecord } from './unleash.ts';

const PORT = Number(process.env.SINK_PORT ?? 3001);
const DATA_DIR = new URL('../data/', import.meta.url);
const JSONL = new URL('impressions.jsonl', DATA_DIR);
const RECENT_MAX = 200;

const toRow = (event: ImpressionRecord): ImpressionRow => ({
  event_id: event.eventId,
  event_time: event.timestamp,
  event_type: event.eventType,
  feature_name: event.featureName,
  enabled: event.enabled,
  variant: event.variant ?? null,
  user_id: event.context?.userId ?? null,
  session_id: event.context?.sessionId ?? null,
  environment: event.environment,
  app_name: event.appName,
  context_json: JSON.stringify(event.context ?? {}),
});

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

await mkdir(DATA_DIR, { recursive: true });
const bqConfig = bigQueryConfig();
const bigquery = bqConfig ? await createBigQueryWriter(bqConfig) : null;
const recent: ImpressionRow[] = [];
let received = 0;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://sink');
  const reply = (code: number, body: unknown): void => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(body));
  };

  try {
    if (req.method === 'POST' && url.pathname === '/impressions') {
      const events = JSON.parse(await readBody(req)) as ImpressionRecord[];
      if (!Array.isArray(events)) return reply(400, { error: 'expected a JSON array' });
      const rows = events.map(toRow);

      await appendFile(JSONL, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
      bigquery?.push(rows);
      recent.unshift(...rows.reverse());
      recent.length = Math.min(recent.length, RECENT_MAX);
      received += rows.length;
      return reply(202, { accepted: rows.length });
    }

    if (url.pathname === '/recent') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, RECENT_MAX);
      return reply(200, { received, events: recent.slice(0, limit) });
    }

    if (url.pathname === '/health') {
      return reply(200, { received, jsonl: 'data/impressions.jsonl', bigquery: bigquery?.stats() ?? 'off (set BIGQUERY_* to turn on)' });
    }

    return reply(404, { error: 'not found' });
  } catch (error) {
    console.error('[sink]', error);
    return reply(400, { error: String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`[sink] http://localhost:${PORT}  → data/impressions.jsonl`);
  console.log(bigquery ? `[sink] BigQuery on → ${bigquery.stats().target}` : '[sink] BigQuery off (set BIGQUERY_PROJECT_ID, BIGQUERY_DATASET, BIGQUERY_TABLE to turn on)');
});
