import { useState, useCallback, useEffect, useRef } from "react";

interface AppPreviewProps {
  url?: string;
  autoRefreshMs?: number;
}

export function AppPreview({ url = "/app/", autoRefreshMs = 0 }: AppPreviewProps) {
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const fetchApp = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      setStatus(res.status);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
      setLastFetched(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
      setResponse(null);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  useEffect(() => {
    if (autoRefreshMs > 0) {
      timerRef.current = setInterval(fetchApp, autoRefreshMs);
      return () => clearInterval(timerRef.current);
    }
  }, [autoRefreshMs, fetchApp]);

  return (
    <div className="app-preview-bezel">
      <div className="app-preview-header">
        <span className="probe-label">App Response</span>
        <div className="app-preview-controls">
          {lastFetched && (
            <span className="app-preview-timestamp">{lastFetched}</span>
          )}
          <button
            type="button"
            className="probe-refresh-btn"
            onClick={fetchApp}
            disabled={loading}
            title="Refresh app response"
            aria-label="Refresh"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={loading ? "probe-spin" : ""}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>
      <div className="app-preview-body">
        {error ? (
          <div className="app-preview-error">{error}</div>
        ) : response !== null ? (
          <div className="app-preview-response">
            <pre className="app-preview-code">{response}</pre>
            {status && (
              <span className={`app-preview-status ${status >= 200 && status < 300 ? "app-preview-ok" : "app-preview-err"}`}>
                {status}
              </span>
            )}
          </div>
        ) : (
          <div className="app-preview-loading">Fetching...</div>
        )}
      </div>
    </div>
  );
}
