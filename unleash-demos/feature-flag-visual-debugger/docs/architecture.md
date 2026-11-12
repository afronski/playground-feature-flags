# Architecture Decisions

## Why a custom waterfall component instead of embedding Jaeger UI

Jaeger UI is a full application with its own routing, state management, and navigation. Embedding it in an iframe would be possible but limits interaction: we couldn't synchronise the waterfall with the service map, couldn't overlay two traces on the same timeline, and couldn't add feature flag badges to spans. A custom React component gives full control over rendering, interaction, and the dual-path comparison view.

## Why React Flow + Dagre for the service map

React Flow provides interactive node graphs with zoom, pan, and custom node components — exactly what the service map needs. Dagre computes directed graph layouts automatically, so nodes are positioned in a logical top-to-bottom flow without manual coordinates. Custom nodes allow rendering service icons, names, and feature flag badges. The combination supports the key interaction: clicking a node highlights that service's spans in the waterfall.

## Why not D3.js for the waterfall or service map

D3 and React both want to own the DOM. The two integration patterns — "D3 for math only" and "D3 owns the SVG" — each introduce friction. With "D3 for math only," you use `d3-scale` for the time axis while React renders everything else. But the waterfall's time axis math is ~20 lines of inline arithmetic (`(spanStart - traceStart) / traceDuration * width`), making `d3-scale` a full dependency for a narrow use. With "D3 owns the SVG," you hand a `ref` to D3 and let it manage the subtree — but then React's component model stops at the boundary. Tooltips, expandable span detail panels, flag badges, and cross-component state (waterfall ↔ service map highlighting) all require bridging two rendering worlds.

The waterfall is visually simple (styled `div`s with horizontal bars) but interaction-heavy (click to expand, filter by service, cross-link to the service map) — React handles this natively without a charting library. The service map needs rich custom nodes (flag variant chips, service type icons, active-path badges) — React Flow provides these as React components, which Dagre lays out hierarchically. D3-force would produce unstable force-directed layouts unsuitable for a fixed call-chain topology where direction matters. Since React Flow already uses D3 internally (`d3-zoom`, `d3-selection`, `d3-drag` as transitive dependencies), the project benefits from D3's algorithms without taking a direct dependency or splitting DOM ownership.

## Why the Unleash API appears as a node in the service map

The Java API's Unleash SDK makes HTTP calls to the Unleash server to evaluate the feature flag. The OTel Java agent captures these as HTTP client spans. This is a real network dependency that affects request timing, so it belongs in the service map. It's positioned as a sidecar (to the right) rather than in the main vertical flow to distinguish it from the data path.

## Why Express as a thin proxy instead of direct browser-to-Jaeger calls

The Jaeger Query API doesn't include CORS headers. Browsers block cross-origin requests from the Vite dev server (port 1337) to Jaeger (port 16686). A thin Express proxy on port 3001 (proxied by Vite in dev) solves this cleanly. The server has no business logic — it forwards requests and responses.

## Why iframe embedding for Unleash and the sample app

The debugger needs to show Unleash UI and the sample app alongside the trace visualisation. Iframes provide isolation: each application runs in its own context with its own JavaScript, styles, and routing. This avoids conflicts and keeps the debugger's codebase focused on visualisation rather than recreating Unleash controls.

## Why npm workspaces monorepo

The debugger has two packages (client and server) that share a TypeScript base configuration and are versioned together. npm workspaces provides this structure with zero additional tooling — no Turborepo, no Lerna. A single `npm install` resolves dependencies for both packages.

## Why Jaeger all-in-one instead of SigNoz or Tempo

Jaeger all-in-one is a single Docker image that provides trace collection, storage, a query API, and a UI. No additional databases (Tempo needs an object store), no complex configuration (SigNoz is a full observability platform). For a local debugging tool, the simplicity of a single container is critical. The Jaeger Query API is well-documented and returns traces in a predictable JSON format.

## Why the Java Spring Boot sample API (not Node.js)

A polyglot stack demonstrates the value of OpenTelemetry's vendor-neutral tracing. If both the sample app and sample API were Node.js, the demo would feel homogeneous. Java + Spring Boot with the OTel Java agent shows that auto-instrumentation works across languages and frameworks. The Java agent captures HTTP, JDBC, and Unleash SDK calls automatically, producing rich traces without code changes.

## Nginx OTel instrumentation: skipped for MVP

The `otel-webserver-module` for Nginx requires compiling a C module matched to the exact Nginx version and architecture. On Alpine, this is fragile and adds significant Docker image complexity. Nginx is a pass-through reverse proxy: it adds ~1ms of latency and doesn't branch or make decisions. The traces from browser → Java API → PostgreSQL are sufficient to demonstrate the feature flag debugging concept. The nginx config explicitly forwards `traceparent`, `tracestate`, and `baggage` headers via `proxy_set_header` directives, ensuring the W3C trace context propagates from browser through nginx to the Java backend without nginx needing its own OTel module.

## How trace propagation works end-to-end

```
Browser (sample-app)
  │  OTel Web SDK creates a span, injects traceparent + baggage headers into fetch()
  ▼
Nginx (serves Sample App UI + reverse proxy)
  │  Passes traceparent + baggage headers through proxy_pass (no span created)
  ▼
Java API (sample-api)
  │  OTel Java agent extracts traceparent, creates HTTP server span (child)
  │  ├── Manual span: feature_flag.evaluate (with flag key, provider, variant attrs)
  │  ├── HTTP client span: Unleash SDK call to Unleash API
  │  └── Manual span: fetchColour_FlagOFF / fetchColour_FlagON
  │      │  attrs: db.statement, db.query.parameter.name, db.result.hex_value, db.result.row_count
  │      └── JDBC span: SELECT ... FROM colours (auto-instrumented by Java agent)
  ▼
OTel Collector
  │  Receives OTLP gRPC/HTTP from Java agent
  │  Receives OTLP HTTP from browser SDK
  ▼
Jaeger
    Stores and serves traces via Query API
```

The browser SDK sends spans to the OTel Collector via a same-origin nginx proxy (`/otel/` → `otel-collector:4318`), avoiding CORS issues that arise when the browser posts cross-origin to `localhost:4318` (the `Access-Control-Allow-Origin: *` wildcard is rejected when the request's credentials mode is `include`). The Java agent also sends to the collector via OTLP/HTTP on port 4318 (`OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`). The Session ID is propagated via W3C Baggage and explicitly set as a span attribute (`session.id`) on both the browser-side root span and the Java-side HTTP server span. This allows the debugger to query Jaeger for traces by `session.id` tag.

Note: W3C Baggage entries are not automatically added as span attributes by OTel SDKs. The Java controller explicitly extracts the `session.id` baggage entry and sets it on the current span via `Baggage.current().getEntryValue("session.id")`.

## Why resizable panes

All pane dividers are draggable (mouse-based resize). This allows the user to allocate screen space based on their current focus: expand Unleash to configure flags, expand the waterfall to study trace details, or expand the service map for architectural overview. The implementation uses React state with mouse event listeners — no external splitter library is needed.

## OTel Collector exporter naming

The OTel Collector `contrib` image v0.148+ deprecates the `otlp` exporter alias. The config uses `otlp_grpc/jaeger` explicitly to export traces from the collector to Jaeger's OTLP gRPC endpoint (port 4317). All services sending to the collector use OTLP/HTTP (port 4318).

## Unleash SDK polling interval (5 seconds)

The Unleash Java SDK defaults to a 15-second polling interval for feature toggle state. For a local debugging tool where the user toggles flags and immediately retriggers a request, 15 seconds feels sluggish. The SDK is configured with `fetchTogglesInterval(5)` and `sendMetricsInterval(5)` to reduce the lag between toggling a flag in Unleash and seeing the new variant in the API response. `synchronousFetchOnInitialisation(true)` ensures the first request after startup already has flag state, avoiding a race where the flag evaluates as disabled because the SDK hasn't fetched yet.

## Independent time axes in the trace waterfall

Each trace section (Flag OFF / Flag ON) has its own time axis scaled to that trace's duration. A shared global axis would compress the shorter trace into a tiny sliver if the two traces have very different durations (e.g., a cold-start trace vs. a warm one). Independent axes make the span structure readable within each trace, while the duration labels provide the absolute comparison.

## Active trace section and service map synchronisation

Clicking a span in the waterfall activates the corresponding trace section (OFF or ON). The service map updates its edge colours and node flag badges to reflect the active section. This lets the user focus on one path at a time — the inactive section dims to 40% opacity in the waterfall, and the service map shows only the active path's colour. Clicking the section header toggles activation; clicking a span always activates its section.

## Service map topology (5 nodes)

The service map displays 5 nodes representing the full request chain:

1. **Browser** — renders the Sample App UI (served by Nginx). User clicks the toggle switch here.
2. **Nginx** (Web Server + Reverse Proxy) — serves the Sample App static assets to the browser and proxies `/api` calls to the Java API.
3. **Sample API** (Java Spring Boot) — evaluates the feature flag and queries the database.
4. **PostgreSQL** — stores the colour data.
5. **Unleash API** (sidecar) — the flag evaluation target, positioned to the right of Sample API.

All 8 edges are numbered sequentially in actual call order: 1. Browser→Nginx fetch, 2. Nginx→API proxy_pass, 3. API→Unleash flag evaluate, 4. Unleash→API variant result, 5. API→PostgreSQL SELECT, 6. PostgreSQL→API result set, 7. API→Nginx upstream response, 8. Nginx→Browser JSON response. Request and response edges between the same pair of nodes originate from nearby handles (38%/62%) with bezier curves that arc in opposite directions. Labels are offset via CSS `transform` (±70px horizontal for vertical edges, ±14px vertical for sidecar edges) to sit on their respective curve and avoid overlapping.

## Span service re-attribution in the waterfall

The OTel Java agent reports all spans under the `sample-api` service. The Jaeger mapper (`lib/jaeger.ts`) re-attributes spans to the correct logical service for display in the waterfall and service map interaction:
- Spans with `feature_flag.key` attribute → shown as `unleash`
- Spans with `db.system` attribute (auto-instrumented JDBC) → shown as `postgresql`
- HTTP client spans targeting Unleash URL → shown as `unleash`
- Manual application spans like `fetchColour_FlagOFF`/`FlagON` remain as `sample-api` (they have `db.statement` for informational purposes but no `db.system`).

## Unleash context values in trace spans

The Java API builds an `UnleashContext` with `appName`, `environment`, and `sessionId` (from W3C Baggage) before each flag evaluation, and passes it to `unleash.isEnabled()`. These values are also recorded as span attributes (`unleash.context.app_name`, `unleash.context.environment`, `unleash.context.session_id`) on the `feature_flag.evaluate` span. This makes the evaluation context visible in the trace waterfall, so the user can see exactly what context Unleash used when deciding the flag variant.

## Manual spans for fetchColour_FlagOFF / fetchColour_FlagON

The `ColourService` wraps each method in a manual OTel span with `db.statement`, `db.query.parameter.name`, `db.result.hex_value`, and `db.result.row_count` as span attributes. This makes the branching after flag evaluation visible in the trace waterfall — the user can see which method was called and what SQL parameter and result were involved. The auto-instrumented JDBC span from the OTel Java agent appears as a child of the manual span.

## Fullscreen pane toggle

Each pane has a small button to expand it to fill the entire screen. The previous splitter positions are preserved in React state, so exiting fullscreen restores the exact layout. For the bottom pane, the button is placed inline in the filter bar (to the right of the title) rather than as an absolute overlay, to avoid obscuring the title text.

## Draggable vertical splitter between trace sections

In comparison mode, the Flag OFF and Flag ON sections are separated by a draggable horizontal divider. Each section has its own scroll container, so long traces in one section don't push the other off-screen. The splitter maintains the dashed-line visual style (`border-dashed border-gray-700`) consistent with the rest of the UI, with a `cursor-row-resize` affordance. The split percentage (default 50/50) is constrained to 20–80% to prevent either section from becoming too small to read. Clicking anywhere within a section activates it (dims the other to 40% opacity), not just clicking the header or a span.

## Version display

The debugger displays its version in the bottom pane header. The version is read from `packages/client/package.json` at build time via Vite's `define` configuration, avoiding runtime file reads.
