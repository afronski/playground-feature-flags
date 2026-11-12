# Dependencies

Every npm package and Docker image used in the project, with justification.

## Debugger — Client (`packages/client`)

| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI framework. Industry standard for component-based UIs. |
| `@xyflow/react` | React Flow v12 — interactive node graph library for the service map. Provides zoom, pan, custom nodes, and edge rendering out of the box. |
| `dagre` | Directed acyclic graph layout algorithm. Computes automatic node positions for the service map (top-to-bottom flow). |
| `typescript` | Static type safety across the entire codebase. |
| `vite` | Fast dev server with HMR and optimised production builds. Chosen over webpack for speed and simplicity. |
| `@vitejs/plugin-react` | Vite plugin for React JSX transform and fast refresh. |
| `tailwindcss`, `@tailwindcss/vite` | Utility-first CSS framework (v4). Eliminates the need for CSS files for layout and theming. |
| `vitest` | Test runner compatible with Vite's transform pipeline. Used for unit test infrastructure. |
| `jsdom` | DOM implementation for vitest's browser-like test environment. |

## Debugger — Server (`packages/server`)

| Package | Purpose |
|---|---|
| `express` | Minimal HTTP framework. Serves as a thin proxy to the Jaeger Query API to avoid CORS issues from the browser. |
| `cors` | Express middleware for CORS headers. Required because the Vite dev server and Express run on different ports. |
| `typescript` | Type safety. |
| `tsx` | TypeScript execution for Node.js with watch mode. Used for development. |

## Root

| Package | Purpose |
|---|---|
| `concurrently` | Runs the client and server dev processes in parallel via a single `make dev` command. |

## Example — Sample App (`example/sample-app`)

| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI framework for the lightbulb demo app. |
| `@opentelemetry/api` | OpenTelemetry API for creating spans and propagating context. |
| `@opentelemetry/sdk-trace-web` | WebTracerProvider for browser-side tracing. |
| `@opentelemetry/sdk-trace-base` | BatchSpanProcessor for efficient span export. |
| `@opentelemetry/resources` | Resource metadata (service.name) attached to all spans. |
| `@opentelemetry/semantic-conventions` | Standard attribute names (ATTR_SERVICE_NAME). |
| `@opentelemetry/instrumentation-fetch` | Auto-instruments `fetch()` calls, adding spans and propagating trace context headers. |
| `@opentelemetry/exporter-trace-otlp-http` | Exports spans to the OTel Collector via OTLP HTTP. |
| `@opentelemetry/context-zone` | Zone.js-based context manager for async context propagation in the browser. |
| `@opentelemetry/core` | W3CTraceContextPropagator and W3CBaggagePropagator for header propagation. |
| `@opentelemetry/instrumentation` | `registerInstrumentations()` utility. |

## Example — Sample API (`example/sample-api`)

| Package | Purpose |
|---|---|
| `spring-boot-starter-web` | HTTP server and REST controller support. |
| `spring-boot-starter-jdbc` | JdbcTemplate for database queries. Chosen over JPA for simplicity and trace-visible SQL. |
| `postgresql` | JDBC driver for PostgreSQL. |
| `io.getunleash:unleash-client-java` | Unleash SDK for feature flag evaluation. Direct SDK usage (no OpenFeature for MVP). |
| `io.opentelemetry:opentelemetry-api` | Manual span creation for feature flag evaluation attributes. |

## Docker Images

| Image | Purpose |
|---|---|
| `postgres:16-alpine` | Shared database for both the sample API (app data) and Unleash (flag configuration). Alpine variant for smaller image size. |
| `unleashorg/unleash-server` | Feature flag management UI and API. Open-source self-hosted deployment. |
| `jaegertracing/all-in-one` | Trace storage, query API, and UI in a single container. Chosen over SigNoz/Tempo for simplicity and built-in UI. |
| `otel/opentelemetry-collector-contrib` | Receives OTLP traces from all services and exports to Jaeger. Contrib variant for broader receiver/exporter support. |
| `nginx:alpine` | Reverse proxy for the sample app. Routes browser requests to the React frontend or Java API. |
| `curlimages/curl` | Lightweight one-shot container for bootstrapping Unleash (creating the feature flag via API). |
| `gradle:8-jdk21` | Build stage for the Java sample API. |
| `eclipse-temurin:21-jre-alpine` | Runtime for the Java sample API. Alpine variant, JRE-only. |
| `node:22-alpine` | Build stage for the React sample app. |
