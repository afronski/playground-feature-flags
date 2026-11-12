# Experiments in Unleash

A small Node.js + TypeScript app that shows four experiment patterns in Unleash Enterprise, and how assignment data reaches BigQuery:

1. **Gradual rollout with an experiment inside**: 20% of users get the rollout, split 50/50 into control and treatment; the other 80% stay untouched.
2. **Mutually exclusive experiments**: a parent flag puts each user in one slot; each experiment is a child flag of one slot, so no user is in two experiments.
3. **Holdout group**: users you choose (a `holdout` context field the app sets from the data team's list) get every flag off through a segment on every strategy. The parent flag also has a holdout slot that no experiment uses.
4. **Four-eyes approval**: production changes go through change requests that a second user must approve.

The back-end evaluates every flag. Each evaluation fires an SDK *impression event*; the app forwards these to a sink, which writes them to a JSONL file and, when configured, streams them to BigQuery. Unleash has no built-in BigQuery connector: this hand-off is the part a customer owns.

Three processes:

- **app** (:3000) is what a real service looks like: back-end SDK tokens only, every flag evaluated on the server, the browser gets results.
- **demo UI** (:3002) serves the grid page and everything that explains it: live rules, Playground verdicts, change requests, expected counts. It reads the Admin API with `UNLEASH_PAT`.
- **sink** (:3001) lands impression events in JSONL and, optionally, BigQuery.

```
 Unleash (hosted)                      this repo
┌──────────────────┐ Client API  ┌───────────────────────────┐  impressions  ┌────────────────────────┐
│ experiments-demo │────────────▶│ app :3000 (Node SDK x2)   │─────────────▶│ sink :3001             │
│  development     │ (1 s poll)  │  back-end SDK tokens only │  POST batch   │  data/impressions.jsonl│
│  production + CR │             │  GET /cell, /cell.json    │  every 1 s    │  BigQuery (optional)   │
│                  │             │  GET /user (one user)     │               └────────────────────────┘
│                  │             └─────────────▲─────────────┘                          ▲
│                  │                           │ iframes (25 cells)                     │ /recent
│                  │ Admin API   ┌─────────────┴─────────────┐                          │
│                  │◀────────────│ demo UI :3002 (grid page) │──────────────────────────┘
└──────────────────┘ (PAT)       │  rules · Playground · CRs │
                                 └───────────────────────────┘
```

> [!WARNING]
> **The demo UI holds an Admin PAT. This is NOT recommended and is only for demos.** It reuses `UNLEASH_PAT` to read live rules, ask the Unleash Playground who the holdout segment excludes, and list change requests. Never put an admin credential in a web process you run for real. The app process shows the real pattern: it needs only a back-end SDK token.

## Quick start

Needs Node.js 22+ and an Unleash Enterprise instance (hosted) where you are an Admin.

```bash
npm install
cp .env.example .env      # fill in UNLEASH_URL, UNLEASH_PAT, UNLEASH_APPROVER_EMAIL, UNLEASH_APPROVER_PASSWORD
npm run provision         # project, flags, change requests, approver user, SDK tokens (written to .env)
npm run dev               # app :3000, sink :3001, demo UI :3002
```

Open <http://localhost:3002> (the demo UI). The app on :3000 serves only the cells and the one-user page.

| Script | What it does |
|---|---|
| `npm run provision` | Creates or resets everything in Unleash. Safe to run again; it also resets the demo between rehearsals. |
| `npm run dev` | Runs the app, the demo UI and the sink (`npm run app`, `npm run demo-ui`, `npm run sink` run them alone). |
| `npm run teardown` | Deletes the flags, SDK tokens and project. Add `-- --include-approver` to also delete the approver user and role, `-- --yes` to skip the prompt. |
| `npm run bigquery:setup` | Creates the BigQuery dataset and table. |
| `npm run typecheck` | `tsc --noEmit`. |

### Environment variables

See [`.env.example`](.env.example). The ones you must set:

| Variable | Meaning |
|---|---|
| `UNLEASH_URL` | Instance URL without `/api`, e.g. `https://us.app.unleash-hosted.com/abcd1234`. |
| `UNLEASH_PAT` | Personal Access Token of an Admin. The scripts use it, and so does the demo UI (**not recommended; demo only**, see the warning above). The app never reads it. |
| `UNLEASH_APPROVER_EMAIL` | Email of the second user who approves change requests. No default. Creating a user may use a paid seat. |
| `UNLEASH_APPROVER_PASSWORD` | That user's password, used only when the script creates the user. Must meet your instance's password rules. |

`npm run provision` fills in `UNLEASH_API_TOKEN_DEVELOPMENT` and `UNLEASH_API_TOKEN_PRODUCTION` (backend SDK tokens). Unleash shows a token's secret only once, so if one stops working the script makes a new one.

Ports and URLs (defaults in `.env.example`): `APP_PORT` / `APP_URL` (3000), `DEMO_UI_PORT` / `DEMO_UI_URL` (3002), `SINK_PORT` / `SINK_URL` (3001). The demo UI loads the cells from `APP_URL`; the app lets only `DEMO_UI_URL` drive them.

## What gets provisioned

Project `experiments-demo` (change with `UNLEASH_PROJECT_ID`) with `development` and `production`.

| Flag | Type | Strategy (stickiness `userId`) | Variants | Depends on |
|---|---|---|---|---|
| `1-rollout` | release | flexible rollout 20% | `control` 50%, `treatment` 50% | – |
| `2-allocation` | experiment | flexible rollout 100% | `holdout` 20%, `exp-a` 20%, `exp-b` 20%, `free` 40% | – (parent) |
| `3-experiment-a` | experiment | flexible rollout 100% | `control` 50%, `treatment` 50% | `2-allocation` = `exp-a` |
| `4-experiment-b` | experiment | flexible rollout 100% | `control` 50%, `treatment` 50% | `2-allocation` = `exp-b` |

- All four flags have **impression data** on.
- **Holdout group**: context field `holdout` (legal values `true` / `false`) and segment `exclude-holdout-group` with one constraint, `holdout` *NOT IN* `[true]` (an inverted `IN`). The segment is on **every strategy of every flag**, in both environments, so a user with `holdout=true` gets nothing, whatever the percentages. Users without the field are not held out.
- **Every flag is off in both environments.** The demo turns them on live: in development directly, in production through a change request (the four-eyes demo).
- **Change requests** are on in production, with 1 approval required.
- **Approver**: a user with the *Viewer* root role, plus a custom project role *Change Request Approver (experiments demo)* that holds only `APPROVE_CHANGE_REQUEST` in production. The approver can approve but not apply, so the requester applies: two people touch every change.
- Each strategy uses the flag name as its `groupId`, so the rollout hash and each variant split are independent of one another.

The flag model lives in one file, [`src/flags.ts`](src/flags.ts). The script writes it to Unleash and the app reads the same names.

### Two holdouts, two jobs

- **Holdout group (tab 3), you pick the users.** The data team owns the list (here [`config/holdout.json`](config/holdout.json), in real life a table they publish). The app looks each user up and sets `holdout: "true"` in the Unleash context; the segment on every strategy keeps every flag off for them: rollouts, the parent flag and every experiment. Membership is explicit and stable, does not depend on hashing, and covers future flags too as long as each new strategy gets the segment.
- **Holdout slot (tab 2), Unleash picks the users.** A slot of `2-allocation` that no experiment depends on: a user there resolves to `holdout` and so matches no child. It keeps a random 20% out of the experiments under this parent, nothing else. A child flag has one parent, which is why this holdout lives inside `2-allocation` rather than in a parent of its own.

The holdout group wins over everything: a user on the list gets `2-allocation` off too, so they hold no slot at all.

### Rules for the parent flag

- **Reserve slots up front.** `free` is spare space: to add `experiment-c`, rename `free` to `exp-c` (keeping its weight) and create a child that depends on `exp-c`.
- **Never change the weights while experiments run.** New weights reshuffle who sits in which slot, which moves users between running experiments.
- **When an experiment ends,** turn its slot into holdout or `free`. Do not spread its weight across the others; that changes the populations of experiments still running.

## JSON variant payloads

Every variant carries a `json` payload. The app paints each grid cell with the payload's `color` and prints its `label`, so editing a payload in Unleash changes the grid within a few seconds. In a real app the payload holds the configuration the treatment needs (copy, limits, URLs), so you can change it without a deploy.

| Flag | Variant | Payload |
|---|---|---|
| `1-rollout` | `control` | `{"experiment":"1-rollout","group":"control","color":"#A5D9C3","label":"Control"}` |
| `1-rollout` | `treatment` | `{"experiment":"1-rollout","group":"treatment","color":"#1E9A6A","label":"Treatment"}` |
| `2-allocation` | `holdout` | `{"slot":"holdout","color":"#1A4049","label":"Holdout slot"}` |
| `2-allocation` | `exp-a` | `{"slot":"exp-a","color":"#8F8AEC","label":"Slot A"}` |
| `2-allocation` | `exp-b` | `{"slot":"exp-b","color":"#D46BAE","label":"Slot B"}` |
| `2-allocation` | `free` | `{"slot":"free","color":"#E9EFEF","label":"Free"}` |
| `3-experiment-a` | `control` | `{"experiment":"3-experiment-a","group":"control","color":"#C9C6F7","label":"Control"}` |
| `3-experiment-a` | `treatment` | `{"experiment":"3-experiment-a","group":"treatment","color":"#6C65E5","label":"Treatment"}` |
| `4-experiment-b` | `control` | `{"experiment":"4-experiment-b","group":"control","color":"#EDB9D9","label":"Control"}` |
| `4-experiment-b` | `treatment` | `{"experiment":"4-experiment-b","group":"treatment","color":"#C0398F","label":"Treatment"}` |

Reading a payload on the back-end ([`src/scenarios.ts`](src/scenarios.ts)):

```ts
const variant = unleash.getVariant('3-experiment-a', { userId });
// { name: 'treatment', enabled: true, feature_enabled: true,
//   payload: { type: 'json', value: '{"experiment":"3-experiment-a","group":"treatment",...}' } }
const config = variant.payload?.type === 'json' ? JSON.parse(variant.payload.value) : undefined;
```

## The page

The page and the cells use the Enterprise FeatureOps styles (DM Sans, JetBrains Mono, teal ink palette). A switch in the header picks *Auto* (follows the system), *Light* or *Dark*; the browser remembers the choice. Cells keep the payload colours in both themes.


- **Tabs** switch the use case. Tabs 1-3 read `development`, tab 4 reads `production`. The text under each tab shows the live rollout % and weights from Unleash.
- **Grid**: 25 iframes (5 × 5), one user each, each a framed box with a shadow. The demo UI loads them from the app (`APP_URL`). Each iframe loads `GET /cell` once, then fetches `GET /cell.json?tab=N&userId=…` from the app whenever the page asks; the app evaluates the flags and the cell redraws itself, coloured by the payload, with the user, the flag results and the payload. Cells never reload, which keeps Chrome's memory flat (reloading 20 iframes every few seconds crashed the tab with *Aw, Snap!*).
- **Excluded users** (orange boxes): on each refresh the demo UI sends all 25 users to the Unleash Playground in one call (`POST /api/admin/playground/advanced`, `userId` and `holdout` as comma-separated lists). Unleash answers, per user and per constraint, whether `exclude-holdout-group` let them through. A user it blocks gets a thick orange frame and a strip with the reason: `EXCLUDED · holdout=true` (the data team's list) or `EXCLUDED · userId rule` (a constraint you added in Unleash). The iframe inside still shows what the app returned. By default the last five cells (`user-21`…`user-25`, `config/holdout.json`) are excluded; there is no separate holdout row.
- **Legend** shows, per result, the count and its share of the eligible users, then the expected count and share, e.g. `Rollout · Control 2 · 10% (exp. 2 · 10%)`. The holdout group counts every excluded user, out of all cells. The demo UI works out the expected shares from the live rules in the Admin API (`GET /expected?tab=N`), including several strategies; a strategy with constraints or another segment can't be predicted, so it is left out with a note.
- **Rules in Unleash** panel: each flag's strategies as Unleash has them now: rollout %, stickiness, variant weights, segments with their constraints, dependencies. A value that changes flashes.
- **Change requests** (tab 4): open change requests in production, with state and a link.
- **Users panel**: `user-01`…`user-25` by default; *Shuffle* puts random IDs in cells 1-20 and keeps cells 21-25 (the split holds on average, not per 20); edit any field to put a chosen user in that cell. The checkbox next to each user sets `holdout=true` in the context: ticked when `config/holdout.json` lists the user; tick or untick to override (ringed). A user field with an orange left edge is excluded by another rule in the segment. *Reset* clears the overrides. The browser remembers the list and the overrides.
- **How this demo works** (collapsed box at the bottom): an architecture diagram, one cell step by step, a live context sample (the context the app evaluated with, its result, and the Playground verdict for a user you pick), the user's hash buckets against the rollout % and variant weights, and a link that opens that user in the app in a new tab (`/user?…&holdout=false`).
- **One-user page** (`APP_URL/user?tab=N&userId=…&holdout=false`): served by the app, so it shows exactly what the back-end returns. It refreshes itself every 3 s; pick the tab, user and `holdout` value at the top.
- **Refresh**: cells re-evaluate every 3 s (2/3/5 s, or off). The SDK polls Unleash every second, so a change shows within about 4 s. The Playground reads Unleash directly, so for about a second after an edit the orange verdict can run ahead of the cell colour.
- **Impressions** panel: the newest events the sink received.
- Header shows SDK status per environment, Admin API state, sink count and BigQuery state, and links to the project in Unleash.

### Why the counts are not exact

Unleash does not count users into buckets. For each user it hashes `groupId:userId` (MurmurHash) to a number from 1 to 100 and lets the user in when the number is at or below the rollout %. Variants work the same way with a second hash. Each user is decided alone, so 20% is a long-run rate, not a quota: 20 users give 4 on average, often 3 or 5. The same holds for the 50/50 split and for the slots.

What this buys you: a user's result never depends on who else is in the system, needs no shared state, and stays the same on every server and SDK. Raising the rollout from 20% to 50% only adds users; nobody already in drops out. With thousands of users the shares come out close to the weights: 10,000 users gave 19.6% in the rollout and 20/20/20/40 across the slots, each within half a point.

The expected counts apply the shares to the users the holdout segment lets through: 20 by default, so 20% is 4 and each 10% is 2. Tick or untick holdout boxes, or add a `userId` constraint to the segment, and the base changes, so expected counts can turn fractional.

On stage: point at the `(exp. …)` numbers in the legend, then press *Shuffle* a few times to show the counts moving around the expected value.

## Demo script

Open the Unleash project in one window and the grid in another. Log in as the approver in a private window or a second browser profile.

Every flag starts off, so every cell starts *Untouched* or *No slot*. Each tab begins with turning flags on.

**1 · Rollout** (development)
- In Unleash, turn on `1-rollout` in development. Within a few seconds roughly 4 of the 20 eligible cells are green: light for control, dark for treatment. The rest are untouched; the orange boxes (the last five cells) are the holdout group. With the default users you get 5 (2:3) against an expected 4 (2:2); see *Why the counts are not exact* above.
- In Unleash, edit `1-rollout` → development → strategy, set rollout to 50%. More cells turn green; users already in stay in, because the rollout hash on `userId` is stable.
- Edit the `treatment` payload's `color`: those cells change colour.

**2 · Exclusive experiments** (development)
- In Unleash, turn on `2-allocation`, `3-experiment-a` and `4-experiment-b` in development. Turn on the parent first: until then every cell shows *No slot*.
- Each cell shows one slot. Indigo cells are in experiment A, magenta in experiment B, pale grey free, dark teal the holdout slot. No red OVERLAP cell appears. Orange cells are the holdout group: they hold no slot at all.
- With the default users the experiments come out one-sided: experiment A has 5 treatment and no control, experiment B has 4 control and no treatment (expected 2 each). Point at the `(exp. …)` numbers, then press *Shuffle* a few times: both groups show up and the counts move around the expected values.
- Show `3-experiment-a` → *Dependencies*: parent `2-allocation`, variant `exp-a`.
- Turn off `3-experiment-a` in development: its cells turn yellow ("experiment off") and do not move into experiment B.

**3 · Holdout group** (development)
- The orange boxes are the holdout group from `config/holdout.json` (`user-21`…`user-25`), each tagged `EXCLUDED · holdout=true`. Each shows all four flags evaluated, all `off`. The other cells show what everyone else got.
- In Unleash, open segment `exclude-holdout-group` (one constraint: `holdout` NOT IN `true`) and show it on the strategies of `1-rollout` and `3-experiment-a`.
- Raise `1-rollout` to 100% in development (turn it on if it is still off): every cell goes into the rollout except the orange ones.
- Tick `user-01` in the Users panel: its cell turns orange on every tab. Untick it to put it back.
- **Dynamic holdout by userId**: in Unleash, add a second constraint to `exclude-holdout-group`: `userId` NOT IN `user-03`. Within about 3 s the box of `user-03` turns orange with `EXCLUDED · userId rule`, the legend's holdout count goes from 5 to 6 and the expected counts use 19 eligible users. The rules panel shows the new constraint. Remove it to put the user back.
- Open *How this demo works* at the bottom, pick `user-03` and open it in the app (`holdout=false` in the link): the app sends `holdout=false`, yet every flag is off, because the segment's `userId` rule runs in Unleash, not in the app.
- If a holdout user ever gets a flag (a strategy without the segment), the cell turns red and names the flag.

**4 · Four-eyes approval** (production)
- Every cell shows *No slot · 2-allocation off*: nothing runs in production yet.
- As yourself, turn on `2-allocation` and `4-experiment-b` in production. Unleash puts both into one draft; submit it as a change request. The grid does not move, and the change request shows above the grid as *In review*.
- As the approver, open *Change requests* and approve. The approver cannot apply.
- As yourself, apply. Within a few seconds slot B cells turn magenta; slot A cells turn yellow ("awaiting approval"), because `3-experiment-a` is still off in production.
- The same applies to strategy, variant, payload and dependency edits in production: experiment setup and edits both need the second person.

Reset for the next run: `npm run provision` (this turns every flag off again in both environments; it lifts change requests for a moment and puts them back).

## Impression events → BigQuery

Unleash SDKs emit an `impression` event on every `isEnabled` / `getVariant` call for a flag with impression data on. The app ([`src/unleash.ts`](src/unleash.ts)) listens, adds an id, time, environment and app name, and posts batches to the sink every second:

```ts
unleash.on('impression', (event) => buffer.push({ ...event, eventId: randomUUID(), timestamp: new Date().toISOString(), environment, appName }));
```

One event as the app sends it:

```json
{
  "eventType": "getVariant",
  "featureName": "3-experiment-a",
  "enabled": true,
  "variant": "treatment",
  "context": { "userId": "user-07", "sessionId": "user-07", "environment": "development", "appName": "experiments-demo-app" },
  "eventId": "6f0c1e8a-…",
  "timestamp": "2026-11-12T09:30:01.123Z",
  "environment": "development",
  "appName": "experiments-demo-app"
}
```

Points for the data team:
- One event per evaluation, not per user. Take the first exposure per user and flag for assignment tables.
- When the SDK evaluates a child flag it checks the parent first, which fires an impression for `2-allocation` too.
- The event has the variant name, not the payload; join on `feature_name` + `variant` if you need it.
- `enabled: false` events record that a user was evaluated and got nothing (e.g. the 80% outside the rollout); keep them to count the untouched group.

The sink ([`src/sink.ts`](src/sink.ts)) turns each event into a row, appends it to `data/impressions.jsonl` and, when BigQuery is configured, streams it with `insertId = event_id` (BigQuery drops repeats on a best-effort basis):

| Column | Type | From |
|---|---|---|
| `event_id` | STRING | `eventId` |
| `event_time` | TIMESTAMP | `timestamp` (partition column, daily) |
| `event_type` | STRING | `eventType` |
| `feature_name` | STRING | `featureName` (cluster column) |
| `enabled` | BOOL | `enabled` |
| `variant` | STRING | `variant` |
| `user_id` | STRING | `context.userId` (cluster column) |
| `session_id` | STRING | `context.sessionId` |
| `environment` | STRING | `environment` |
| `app_name` | STRING | `appName` |
| `context_json` | JSON | `context` |

### Turn on BigQuery

```bash
gcloud auth application-default login     # or GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (BigQuery Data Editor)
# in .env: BIGQUERY_PROJECT_ID=my-gcp-project  (BIGQUERY_DATASET=unleash, BIGQUERY_TABLE=impressions, BIGQUERY_LOCATION=US)
npm run bigquery:setup
npm run dev                               # the sink logs "BigQuery on → …"; the header pill counts rows written
```

The grid re-evaluates 25 users every few seconds, roughly 10-40 rows a second while the page is open. Turn auto refresh off when you don't need it.

Example queries:

```sql
-- Who is in which group (first exposure)
SELECT feature_name, variant, user_id, MIN(event_time) AS first_exposure
FROM `my-gcp-project.unleash.impressions`
WHERE enabled AND environment = 'production'
  AND feature_name IN ('1-rollout', '3-experiment-a', '4-experiment-b')
GROUP BY feature_name, variant, user_id;

-- Group sizes per experiment
SELECT feature_name, variant, COUNT(DISTINCT user_id) AS users
FROM `my-gcp-project.unleash.impressions`
WHERE enabled AND environment = 'production'
GROUP BY feature_name, variant
ORDER BY feature_name, variant;

-- Check: no user in two experiments
SELECT user_id, COUNT(DISTINCT feature_name) AS experiments
FROM `my-gcp-project.unleash.impressions`
WHERE enabled AND feature_name IN ('3-experiment-a', '4-experiment-b')
GROUP BY user_id
HAVING experiments > 1;

-- Check: the holdout group never got a flag (should return no rows)
SELECT user_id, feature_name, variant, event_time
FROM `my-gcp-project.unleash.impressions`
WHERE enabled AND JSON_VALUE(context_json, '$.properties.holdout') = 'true';
```

In production you would replace this sink with your own pipeline (Pub/Sub → BigQuery subscription, Kafka, Segment, …). The app side stays the same: an `impression` listener that forwards events.

## Editions

| Shown here | Needs |
|---|---|
| Parent/child flags (mutual exclusion, holdout slot) | Enterprise |
| Change requests, custom roles, approver user | Enterprise |
| Project-scoped segment and context field (holdout group) | Enterprise |
| Gradual rollout, strategy variants, JSON payloads, impression data | any edition |

## Troubleshooting

- **Cells say "Connecting to Unleash…"**: check `UNLEASH_URL` and the `UNLEASH_API_TOKEN_*` values; `npm run provision` checks and replaces broken tokens.
- **No orange boxes, or a note under the legend says "Playground verdicts unavailable"**: the demo UI cannot reach the Admin API. Check `UNLEASH_PAT` (the *Admin API* chip in the header shows the error). The boxes then fall back to `config/holdout.json`.
- **Grid stays grey, cells never load**: the demo UI loads cells from `APP_URL`, and the app accepts messages only from `DEMO_UI_URL`. Both must match the URLs you open, including the port.
- **Provisioning changes don't show in production**: something left change requests on mid-run. Run `npm run provision` again; it lifts them while it writes and puts them back.
- **Approver cannot log in**: your instance may allow SSO only. Turn on password login for the approver, or give an SSO user the *Change Request Approver (experiments demo)* role on the project.
- **An open change request from a rehearsal**: reject or close it in Unleash before the next run.
- **Sink down**: the app logs it once and drops events until the sink is back. The grid keeps working.

## Files

```
src/flags.ts          flag model: names, weights, payloads, dependencies
src/unleash.ts        SDK clients (development, production) and impression forwarding
src/scenarios.ts      what each tab evaluates for one user (used by the app)
src/app.ts            the app: cells, one-user page, holdout list, health (back-end SDK tokens only)
src/demo-ui.ts        the demo UI: grid page, live rules, Playground verdicts, change requests, hashes, proxies
src/admin.ts          Admin API client for the demo UI (UNLEASH_PAT: demo only)
src/expected.ts       expected share per legend entry, from the live rules
src/sink.ts           impression sink: JSONL + optional BigQuery
src/bigquery.ts       BigQuery schema and batched writer
public/index.html     the grid page (served by the demo UI)
public/cell.html      one grid cell (loads once, redraws on request from the demo UI)
public/user.html      one user as the app sees them (refreshes itself)
config/holdout.json   the holdout group (stand-in for the data team's table)
scripts/provision.ts  sets up Unleash (idempotent, also resets the demo)
scripts/teardown.ts   removes it again
scripts/bigquery-setup.ts  creates dataset and table
```

The Admin API client and the change-request guard come from the [FeatureOps workshop](https://github.com/Unleash/workshop-featureops-for-platform-engineers) provisioner.
