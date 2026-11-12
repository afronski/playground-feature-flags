// Raw Jaeger API response types
export interface JaegerResponse {
  data: JaegerTrace[];
  total: number;
  limit: number;
  offset: number;
  errors: null | unknown[];
}

export interface JaegerTrace {
  traceID: string;
  spans: JaegerSpan[];
  processes: Record<string, JaegerProcess>;
  warnings: string[] | null;
}

export interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  references: JaegerReference[];
  startTime: number; // microseconds
  duration: number; // microseconds
  tags: JaegerTag[];
  logs: JaegerLog[];
  processID: string;
  warnings: string[] | null;
}

export interface JaegerReference {
  refType: 'CHILD_OF' | 'FOLLOWS_FROM';
  traceID: string;
  spanID: string;
}

export interface JaegerProcess {
  serviceName: string;
  tags: JaegerTag[];
}

export interface JaegerTag {
  key: string;
  type: string;
  value: string | number | boolean;
}

export interface JaegerLog {
  timestamp: number;
  fields: JaegerTag[];
}

// Internal normalized model
export interface Trace {
  traceId: string;
  spans: Span[];
  rootSpan: Span;
  duration: number; // microseconds
  startTime: number; // microseconds
  services: string[];
  flagVariant: string | null; // 'enabled' | 'disabled' | null
}

export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTime: number; // microseconds
  duration: number; // microseconds
  tags: Record<string, string | number | boolean>;
  children: Span[];
  depth: number;
  featureFlag?: {
    key: string;
    provider: string;
    variant: string;
  };
}

export interface TracePair {
  flagOff: Trace | null;
  flagOn: Trace | null;
}
