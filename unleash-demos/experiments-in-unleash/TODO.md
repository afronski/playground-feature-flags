# TODO

## Impressions as OpenTelemetry logs instead of built-in BigQuery

Today the app posts impressions in its own JSON format to the sink. The sink writes `data/impressions.jsonl` and, when configured, streams to BigQuery (`src/sink.ts`, `src/bigquery.ts`, `scripts/bigquery-setup.ts`, `@google-cloud/bigquery` in `optionalDependencies`).

- **Remove BigQuery from the demo:** the code, the setup script, the dependency, the `BIGQUERY_*` variables and the README section.
- **App: emit each impression as an OTel log record over OTLP.** Use `@opentelemetry/sdk-logs` and `@opentelemetry/exporter-logs-otlp-http`, and follow the [feature-flag semantic conventions](https://opentelemetry.io/docs/specs/semconv/feature-flags/feature-flags-events/):
  - event name `feature_flag.evaluation`
  - `feature_flag.key`
  - `feature_flag.result.variant`
  - `feature_flag.context.id` = `userId`
  - `feature_flag.provider.name` = `Unleash`
  - our own attributes: `event_id`, `enabled`, `holdout`
  - These conventions are still *Development* / *Release Candidate*. Check the names when you build it.
- **Sink: a small Node OTLP/HTTP receiver** (`POST /v1/logs`) that writes JSONL, so the demo still runs without Docker.
- **Real storage: point `OTEL_EXPORTER_OTLP_ENDPOINT` at an OpenTelemetry Collector.** It writes through its own exporters (ClickHouse, Kafka, AWS S3, Elasticsearch, Loki, vendors), so the repo needs no code per storage. Ship an example `otel-collector.yaml`.
- **Watch for:**
  - BigQuery has no direct Collector exporter. It needs a path through Pub/Sub or Cloud Logging.
  - Never sample these logs: experiment analysis needs every exposure.
  - Delivery is at least once, so keep `event_id` and remove duplicates downstream.
  - Attributes land as a map (ClickHouse `LogAttributes`). Analysis needs a view that pulls out the columns.

## Experiment analysis and visualization

- Unleash assigns users and records exposures; analysis happens outside it.
- Connect the impression data to Metabase or Apache Superset: group sizes, first exposure per user and flag, outcome metrics per variant, holdout group against everyone else.
- Ship a dashboard (or setup steps) with the demo.

## Impact Metrics and business-value charts

Researched, not started. Plan: record business counters (`orders`, `revenue_eur`) through `unleash.impactMetrics`. Drive them with a traffic simulator in the app, and let `npm run provision` create charts on each flag page (`POST /api/admin/projects/{project}/features/{flag}/impact-metrics/config`).

Open questions:
- The SDK attaches only `appName`, `environment` and `origin` labels.
- Per-variant labels come only through the `flagContext` argument, which `unleash-client` 6.12.2 marks deprecated (`lib/impact-metrics/metric-api.d.ts`).
- Test whether Unleash keeps those labels. Our flag names (`1-rollout`, …) are not valid Prometheus label names. If the labels don't survive, put the group in the metric name instead (`orders_exp_a_treatment`).
