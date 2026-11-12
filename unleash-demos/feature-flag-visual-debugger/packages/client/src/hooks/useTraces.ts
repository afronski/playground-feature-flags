import { useState, useCallback } from 'react';
import type { Trace, JaegerResponse } from '../types/trace';
import { mapJaegerTrace } from '../lib/jaeger';

interface UseTracesResult {
  traces: Trace[];
  loading: boolean;
  error: string | null;
  fetchTraces: (sessionId: string) => Promise<void>;
}

export function useTraces(): UseTracesResult {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTraces = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const tags = JSON.stringify({ 'session.id': sessionId });
      const params = new URLSearchParams({
        service: 'sample-api',
        tags,
        limit: '20',
        lookback: '1h',
      });
      const res = await fetch(`/api/traces?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: JaegerResponse = await res.json();
      const mapped = (data.data ?? []).map(mapJaegerTrace);
      // Sort by startTime descending (newest first)
      mapped.sort((a, b) => b.startTime - a.startTime);
      setTraces(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch traces');
      setTraces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { traces, loading, error, fetchTraces };
}
