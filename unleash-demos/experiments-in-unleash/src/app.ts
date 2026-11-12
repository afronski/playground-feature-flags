/**
 * The app: what a real service looks like. It holds back-end SDK tokens only (src/unleash.ts),
 * evaluates every flag on the server and hands the browser the result. No Admin API, no PAT.
 * The grid page, live rules and Playground verdicts live in a separate process: src/demo-ui.ts.
 *
 *   GET /cell?tab=1..4&userId=…[&holdout=…]       one grid cell (HTML) embedded by the demo UI
 *   GET /cell.json?tab=…&userId=…[&holdout=…]     flags evaluated on the server for that user
 *   GET /user?tab=…&userId=…[&holdout=…]          the same user as a standalone page, refreshes itself
 *   GET /holdout                                  the holdout group from config/holdout.json
 *   GET /health                                   SDK status per environment
 *
 * holdout=true|1 or false|0 overrides the list. Without it, a user is in the holdout group when
 * config/holdout.json lists them (the data team's table). The app passes that as `holdout` in the
 * Unleash context; the segment on every strategy does the rest.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { evaluateCell, userContext, TAB_ENVIRONMENT, HOLDOUT_GROUP_COLOR, HOLDOUT_GROUP_LEGEND, type CellResult, type Tab } from './scenarios.ts';
import { getClient, status, APP_NAME } from './unleash.ts';

const PORT = Number(process.env.APP_PORT ?? 3000);
const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return 'http://localhost:3002';
  }
};
/** Only the demo UI may drive the embedded cells (postMessage origin check). */
const DEMO_UI_ORIGIN = originOf(process.env.DEMO_UI_URL || 'http://localhost:3002');
const CELL = new URL('../public/cell.html', import.meta.url);
const USER = new URL('../public/user.html', import.meta.url);
const HOLDOUT_FILE = new URL('../config/holdout.json', import.meta.url);

/** Read on every call, so edits to the file apply without a restart. */
const holdoutList = async (): Promise<string[]> => {
  try {
    const { users } = JSON.parse(await readFile(HOLDOUT_FILE, 'utf8')) as { users?: unknown };
    return Array.isArray(users) ? users.map(String) : [];
  } catch {
    return [];
  }
};

const INK = '#1A4049';
/** Dark ink or white text, whichever reads better on the cell colour. */
const textOn = (hex: string): string => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return INK;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? INK : '#FFFFFF';
};

const send = (res: ServerResponse, code: number, type: string, body: string): void => {
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(body);
};
const json = (res: ServerResponse, code: number, body: unknown): void => send(res, code, 'application/json', JSON.stringify(body));

/** true/1 → true, false/0 → false, anything else → undefined (use the list). */
const parseHoldout = (value: string | null): boolean | undefined =>
  value === '1' || value === 'true' ? true : value === '0' || value === 'false' ? false : undefined;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const tab = Number(url.searchParams.get('tab')) as Tab;
  const validTab = [1, 2, 3, 4].includes(tab);

  try {
    if (url.pathname === '/cell') {
      const page = (await readFile(CELL, 'utf8')).replace('__DEMO_UI_ORIGIN__', JSON.stringify(DEMO_UI_ORIGIN));
      return send(res, 200, 'text/html', page);
    }
    if (url.pathname === '/user') return send(res, 200, 'text/html', await readFile(USER, 'utf8'));

    if (url.pathname === '/cell.json') {
      const userId = (url.searchParams.get('userId') ?? '').trim().slice(0, 64);
      if (!validTab || !userId) return json(res, 400, { error: 'tab=1..4 and userId are required' });

      const override = parseHoldout(url.searchParams.get('holdout'));
      const holdout = override ?? (await holdoutList()).includes(userId);
      const environment = TAB_ENVIRONMENT[tab];
      const unleash = getClient(environment);
      const result: CellResult = unleash
        ? evaluateCell(tab, unleash, userId, holdout)
        : { color: '#E9EFEF', legend: 'SDK not ready', headline: 'Connecting to Unleash…', rows: [['environment', environment]] };
      // The exact context the SDK evaluated with (it adds appName and environment from its config).
      const context = { ...userContext(userId, holdout), appName: APP_NAME, environment };
      return json(res, 200, { userId, tab, environment, holdout, holdoutSource: override === undefined ? 'config/holdout.json' : 'override', context, text: textOn(result.color), ...result });
    }

    if (url.pathname === '/holdout') {
      return json(res, 200, { source: 'config/holdout.json', users: await holdoutList(), legend: HOLDOUT_GROUP_LEGEND, color: HOLDOUT_GROUP_COLOR });
    }

    if (url.pathname === '/health') return json(res, 200, { appName: APP_NAME, sdk: status() });

    return send(res, 404, 'text/plain', 'Not found. The grid page is served by the demo UI (npm run demo-ui).');
  } catch (error) {
    console.error(error);
    return send(res, 500, 'text/plain', 'Internal error');
  }
});

server.listen(PORT, () => console.log(`[app] http://localhost:${PORT}  (back-end SDK tokens only)`));
