import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator, W3CBaggagePropagator, CompositePropagator } from '@opentelemetry/core';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

// --- Session ID management ---
// Generate a fresh session ID on every page load so each demo run
// produces traces under a distinct session.
const sessionId = crypto.randomUUID();

export function getSessionId(): string {
  return sessionId;
}

export function createBaggage() {
  return propagation.createBaggage({
    'session.id': { value: sessionId },
  });
}

// --- OTel SDK initialization ---

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'sample-app',
});

const exporter = new OTLPTraceExporter({
  url: `${window.location.origin}/otel/v1/traces`,
});

const provider = new WebTracerProvider({
  resource,
  spanProcessors: [new BatchSpanProcessor(exporter)],
});

propagation.setGlobalPropagator(
  new CompositePropagator({
    propagators: [
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator(),
    ],
  }),
);

provider.register({
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      ignoreUrls: [/\/otel\//],
    }),
  ],
});

export const tracer = trace.getTracer('sample-app');

// Helper: execute a callback within a context that has session baggage set.
// Use this to wrap fetch calls so baggage (session.id) is propagated.
export function withSessionBaggage<T>(fn: () => T): T {
  const baggage = createBaggage();
  const ctx = propagation.setBaggage(context.active(), baggage);
  return context.with(ctx, fn);
}
