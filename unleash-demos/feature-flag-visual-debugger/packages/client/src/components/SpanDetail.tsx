import type { Span } from '../types/trace';

interface SpanDetailProps {
  span: Span;
  colour: string;
}

const FLAG_TAG_PREFIX = 'feature_flag.';
const HIGHLIGHT_KEYS = new Set(['http.method', 'http.url', 'http.status_code', 'db.statement', 'db.system']);

export default function SpanDetail({ span, colour }: SpanDetailProps) {
  const durationMs = (span.duration / 1000).toFixed(1);
  const entries = Object.entries(span.tags);
  const flagTags = entries.filter(([key]) => key.startsWith(FLAG_TAG_PREFIX));
  const highlightTags = entries.filter(
    ([key]) => HIGHLIGHT_KEYS.has(key) && !key.startsWith(FLAG_TAG_PREFIX),
  );
  const otherTags = entries.filter(
    ([key]) => !key.startsWith(FLAG_TAG_PREFIX) && !HIGHLIGHT_KEYS.has(key),
  );

  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded mx-2 mb-1 px-4 py-3 text-xs">
      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2">
        <Detail label="Service" value={span.serviceName} />
        <Detail label="Operation" value={span.operationName} />
        <Detail label="Duration" value={`${durationMs} ms`} />
        <Detail label="Span ID" value={span.spanId} mono />
        <Detail label="Trace ID" value={span.traceId} mono />
      </div>

      {flagTags.length > 0 && (
        <TagSection title="Feature Flag" tags={flagTags} style={{ color: colour }} />
      )}
      {highlightTags.length > 0 && (
        <TagSection title="Request / Query" tags={highlightTags} className="text-blue-400" />
      )}
      {otherTags.length > 0 && (
        <TagSection title="Tags" tags={otherTags} className="text-gray-400" />
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className={mono ? 'font-mono text-gray-300' : 'text-gray-200'}>{value}</span>
    </div>
  );
}

function TagSection({
  title,
  tags,
  className,
  style,
}: {
  title: string;
  tags: [string, string | number | boolean][];
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="mt-2">
      <div className={`font-semibold mb-1 ${className ?? 'text-gray-400'}`} style={style}>{title}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {tags.map(([key, value]) => (
          <div key={key} className="contents">
            <span className="text-gray-500 font-mono truncate">{key}</span>
            <span className="text-gray-300 font-mono break-all">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
