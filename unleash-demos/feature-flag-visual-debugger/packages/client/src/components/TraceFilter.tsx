import { useState } from 'react';
import type { Trace, TracePair } from '../types/trace';

interface TraceFilterProps {
  traces: Trace[];
  loading: boolean;
  error: string | null;
  onFetchTraces: (sessionId: string) => void;
  tracePair: TracePair;
  onTracePairChange: (pair: TracePair) => void;
  version: string;
}

export default function TraceFilter({
  traces,
  loading,
  error,
  onFetchTraces,
  tracePair,
  onTracePairChange,
  version,
}: TraceFilterProps) {
  const [sessionId, setSessionId] = useState('');

  const handleFetch = () => {
    if (sessionId.trim()) {
      onFetchTraces(sessionId.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFetch();
  };

  const formatTraceOption = (trace: Trace) => {
    const time = new Date(trace.startTime / 1000).toLocaleTimeString();
    const variant = trace.flagVariant ?? 'unknown';
    const shortId = trace.traceId.slice(0, 12);
    return `${shortId}… — ${variant} — ${time}`;
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <label className="text-gray-400 font-medium whitespace-nowrap">Session ID:</label>
      <input
        type="text"
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Paste session ID from sample app"
        className="flex-1 max-w-md px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
      />
      <button
        onClick={handleFetch}
        disabled={loading || !sessionId.trim()}
        className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? 'Loading…' : 'Fetch Traces'}
      </button>

      {traces.length > 0 && (
        <>
          <select
            value={tracePair.flagOff?.traceId ?? ''}
            onChange={(e) => {
              const trace = traces.find(t => t.traceId === e.target.value) ?? null;
              onTracePairChange({ ...tracePair, flagOff: trace });
            }}
            className="px-2 py-1.5 bg-gray-900 border border-blue-500/50 rounded text-gray-200 text-xs"
          >
            <option value="">Flag OFF trace…</option>
            {traces.map(t => (
              <option key={t.traceId} value={t.traceId}>
                {formatTraceOption(t)}
              </option>
            ))}
          </select>
          <select
            value={tracePair.flagOn?.traceId ?? ''}
            onChange={(e) => {
              const trace = traces.find(t => t.traceId === e.target.value) ?? null;
              onTracePairChange({ ...tracePair, flagOn: trace });
            }}
            className="px-2 py-1.5 bg-gray-900 border border-green-500/50 rounded text-gray-200 text-xs"
          >
            <option value="">Flag ON trace…</option>
            {traces.map(t => (
              <option key={t.traceId} value={t.traceId}>
                {formatTraceOption(t)}
              </option>
            ))}
          </select>
        </>
      )}

      {error && <span className="text-red-400 text-xs">{error}</span>}

      <span className="ml-auto text-[11px] text-gray-500 font-medium whitespace-nowrap">
        Unleash Feature Flagging Visual Debugger{' '}
        <span className="text-gray-600">(v{version})</span>
      </span>
    </div>
  );
}
