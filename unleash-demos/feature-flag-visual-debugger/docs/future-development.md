# Road to 1.0.0

Current version: **0.8.0** (MVP — functional but architecturally constrained).

The path to 1.0.0 focuses on making the debugger a self-contained, embeddable front-end component with no Node.js backend dependency.

## Architecture

### Remove the Node.js API server

The Express proxy (`packages/server`) exists solely to work around CORS when fetching traces from Jaeger. For 1.0.0, the debugger should connect to Jaeger's Query API directly from the browser. This likely requires Jaeger to be configured with appropriate CORS headers, or the debugger to be served from the same origin.

### Pure front-end component

The debugger should be distributable as:
- A **standalone static site** that can be hosted by any web server (Nginx, Caddy, S3, etc.).
- An **embeddable React component** that can be dropped into an existing page. A button shows/hides the debugger panel, and a `console` call (e.g., `window.__flagDebugger.open()`) can trigger it programmatically.

The hosting concern is separated from the component itself.

### Jaeger V1 and V2 compatibility

Ensure the trace fetching and parsing layer works with both Jaeger Query API V1 (`/api/traces`) and V2 (`/api/v3/traces`). The response formats differ — abstract the mapping layer to handle both.

## UI and Filtering

### Theme support (dark / light mode)

Pretty self-explanatory. :wink:

### Generic naming of sections for "Flag ON" and "Flag OFF"

Currently, the debugger has two sections for comparing traces between "Flag ON" and "Flag OFF", but the names are not generic enough to be reused. Consider renaming them to "Group A" and "Group B" to make the sections more generic and reusable. A setting for adjusting colors would be nice too.

### Settings UI for Jaeger URL

Add a settings panel where the user configures the Jaeger Query API URL (and optionally authentication headers). Currently the URL is hardcoded via environment variable. This should be persisted in `localStorage`.

### Flexible trace filtering

The current filter only supports Session ID lookup (via `session.id` tag). Extend filtering to support:
- Arbitrary tag key-value pairs.
- Time range selection.
- Service name filter.
- Operation name filter.
- Free-text search across span attributes.

### Context overrides

Consider whether context overrides (e.g., forcing a specific Unleash context for flag evaluation) make sense when the debugger is a purely front-end tool with no backend. The debugger observes traces — it doesn't participate in the request path. Context overrides would require a backend component or a browser extension to inject headers. This may be out of scope for 1.0.0.

### Diffs

We should support showing a diff for both waterfall view of traces and spans, and service map diffing. It is a challenge how t o handle this in UX-friendly way, but it is an important feature.

## Data model

### Service map deduced from trace data

The current service map has a hardcoded 5-node topology. For 1.0.0, the service map must be **dynamically constructed** from the trace data: extract unique service names, infer edges from parent-child span relationships, and layout with Dagre. This makes the debugger work with any instrumented application, not just the bundled example.

### Trace spans without hardcoding

Similarly, the span re-attribution logic (feature_flag -> unleash, db.system -> postgresql) should be generic. Use OTel semantic conventions to categorize spans rather than hardcoding service names. The waterfall should render whatever spans Jaeger returns, with intelligent grouping based on standard attributes.
