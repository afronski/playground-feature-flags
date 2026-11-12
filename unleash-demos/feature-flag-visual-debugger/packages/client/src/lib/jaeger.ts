import type { JaegerTrace, JaegerSpan, Trace, Span } from '../types/trace';

export function mapJaegerTrace(raw: JaegerTrace): Trace {
  // Build a map of spanID -> Span
  const spanMap = new Map<string, Span>();

  for (const jSpan of raw.spans) {
    const process = raw.processes[jSpan.processID];
    const tags: Record<string, string | number | boolean> = {};
    for (const tag of jSpan.tags) {
      tags[tag.key] = tag.value;
    }

    let featureFlag: Span['featureFlag'];
    const flagKey = tags['feature_flag.key'];
    if (flagKey && typeof flagKey === 'string') {
      featureFlag = {
        key: flagKey,
        provider: String(tags['feature_flag.provider_name'] ?? 'unknown'),
        variant: String(tags['feature_flag.variant'] ?? 'unknown'),
      };
    }

    // Re-attribute service name based on span semantics:
    // - Spans with feature_flag.key → unleash (flag evaluation)
    // - Auto-instrumented JDBC spans (db.system present) → postgresql
    // - HTTP client spans targeting unleash → unleash
    // Note: manual spans like fetchColour_FlagOFF/ON have db.statement but
    // NOT db.system — they must stay as sample-api, not postgresql.
    let serviceName = process?.serviceName ?? 'unknown';
    if (featureFlag) {
      serviceName = 'unleash';
    } else if (tags['db.system']) {
      serviceName = 'postgresql';
    } else if (
      typeof tags['http.url'] === 'string' && String(tags['http.url']).includes('unleash')
    ) {
      serviceName = 'unleash';
    }

    const span: Span = {
      spanId: jSpan.spanID,
      traceId: jSpan.traceID,
      parentSpanId: findParentSpanId(jSpan),
      operationName: jSpan.operationName,
      serviceName,
      startTime: jSpan.startTime,
      duration: jSpan.duration,
      tags,
      children: [],
      depth: 0,
      featureFlag,
    };

    spanMap.set(jSpan.spanID, span);
  }

  // Build tree
  let rootSpan: Span | undefined;
  for (const span of spanMap.values()) {
    if (span.parentSpanId) {
      const parent = spanMap.get(span.parentSpanId);
      if (parent) {
        parent.children.push(span);
      }
    }
    if (!span.parentSpanId || !spanMap.has(span.parentSpanId)) {
      rootSpan = rootSpan ?? span;
    }
  }

  // Sort children by startTime and compute depth
  if (rootSpan) {
    computeDepth(rootSpan, 0);
  }

  // Flatten spans in DFS order for the waterfall
  const spans = rootSpan ? flattenSpans(rootSpan) : Array.from(spanMap.values());

  // Detect services
  const services = [...new Set(spans.map(s => s.serviceName))];

  // Detect flag variant
  const flagSpan = spans.find(s => s.featureFlag);
  const flagVariant = flagSpan?.featureFlag?.variant ?? null;

  const startTime = Math.min(...spans.map(s => s.startTime));
  const endTime = Math.max(...spans.map(s => s.startTime + s.duration));

  return {
    traceId: raw.traceID,
    spans,
    rootSpan: rootSpan ?? spans[0],
    duration: endTime - startTime,
    startTime,
    services,
    flagVariant,
  };
}

function findParentSpanId(span: JaegerSpan): string | null {
  const childOf = span.references.find(r => r.refType === 'CHILD_OF');
  return childOf?.spanID ?? null;
}

function computeDepth(span: Span, depth: number): void {
  span.depth = depth;
  span.children.sort((a, b) => a.startTime - b.startTime);
  for (const child of span.children) {
    computeDepth(child, depth + 1);
  }
}

function flattenSpans(span: Span): Span[] {
  const result: Span[] = [span];
  for (const child of span.children) {
    result.push(...flattenSpans(child));
  }
  return result;
}
