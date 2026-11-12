import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useImpressionBus } from "../hooks/useImpressionBus.js";
import type { ImpressionEvent } from "../types/impression.js";

const WS_URL =
  typeof window !== "undefined"
    ? `ws://${window.location.host}/ws/impressions`
    : "";

const ENVIRONMENTS = ["development", "production"];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function fetchFlags(): Promise<string[]> {
  try {
    const token = sessionStorage.getItem("workbench:unleash-token") || "";
    if (!token) return [];
    const res = await fetch("/unleash/api/client/features", {
      headers: { Authorization: token },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const features = data.features ?? [];
    return Array.isArray(features)
      ? features.map((f: { name: string }) => f.name)
      : [];
  } catch {
    return [];
  }
}

export function LightbulbProbe() {
  const [flagName, setFlagName] = useState("lightbulb-colour");
  const [environment, setEnvironment] = useState("development");
  const [flags, setFlags] = useState<string[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const filter = useCallback(
    (e: ImpressionEvent) => e.flag === flagName,
    [flagName]
  );

  const { events, connected } = useImpressionBus(WS_URL, {
    filter,
    maxEvents: 3,
  });

  const isOn = useMemo(() => {
    return events.length > 0 && events[0].enabled;
  }, [events]);

  const handleRefreshFlags = useCallback(async () => {
    setLoadingFlags(true);
    const names = await fetchFlags();
    setFlags(names);
    if (names.length > 0) {
      setFlagName((prev) => names.includes(prev) ? prev : names[0]);
    }
    setLoadingFlags(false);
  }, []);

  useEffect(() => {
    handleRefreshFlags();
    const handler = () => handleRefreshFlags();
    window.addEventListener("workbench:token-updated", handler);
    return () => window.removeEventListener("workbench:token-updated", handler);
  }, [handleRefreshFlags]);

  return (
    <div className="probe-bezel probe-compact">
      {/* Controls row: env + flag + bulb */}
      <div className="probe-controls-row">
        <div className="probe-controls-selects">
          <div className="probe-control-group">
            <label className="probe-control-label" htmlFor="probe-env">Env</label>
            <select
              id="probe-env"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="probe-select"
            >
              {ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>{env}</option>
              ))}
            </select>
          </div>
          <div className="probe-control-group">
            <label className="probe-control-label" htmlFor="probe-flag">Flag</label>
            <div className="probe-flag-row">
              {flags.length > 0 ? (
                <select
                  id="probe-flag"
                  value={flagName}
                  onChange={(e) => setFlagName(e.target.value)}
                  className="probe-select"
                >
                  {flags.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              ) : (
                <input
                  id="probe-flag"
                  type="text"
                  value={flagName}
                  onChange={(e) => setFlagName(e.target.value)}
                  className="probe-input"
                  placeholder="flag name"
                />
              )}
              <button
                type="button"
                className="probe-refresh-btn"
                onClick={handleRefreshFlags}
                disabled={loadingFlags}
                title="Refresh flag list"
                aria-label="Refresh"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={loadingFlags ? "probe-spin" : ""}
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Inline bulb */}
        <div className="probe-bulb-inline">
          <svg
            width="48"
            height="72"
            viewBox="0 0 80 120"
            className={`probe-bulb ${isOn ? "probe-bulb-on" : "probe-bulb-off"}`}
          >
            <ellipse cx="40" cy="45" rx="28" ry="32" />
            <rect x="28" y="72" width="24" height="8" rx="2" />
            <rect x="26" y="80" width="28" height="16" rx="4" fill="var(--color-bezel-label)" />
            <line x1="26" y1="86" x2="54" y2="86" stroke="var(--color-bezel)" strokeWidth="1.5" />
            <line x1="26" y1="90" x2="54" y2="90" stroke="var(--color-bezel)" strokeWidth="1.5" />
            <path
              d="M 33 50 Q 37 35 40 50 Q 43 35 47 50"
              fill="none"
              stroke={isOn ? "var(--color-wire)" : "var(--color-bezel-label)"}
              strokeWidth="1.5"
            />
          </svg>
          <span className={`probe-bulb-state ${isOn ? "probe-state-on" : "probe-state-off"}`}>
            {isOn ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      {/* Event log */}
      <div className="probe-event-log">
        <div className="probe-event-log-header">
          <span className="probe-label">Event Log</span>
          <div
            className="probe-status-dot-wrapper"
            onMouseEnter={() => setTooltipVisible(true)}
            onMouseLeave={() => setTooltipVisible(false)}
          >
            <span
              className={`probe-connection-dot ${connected ? "probe-connected" : "probe-disconnected"}`}
            />
            {tooltipVisible && (
              <div className="probe-tooltip">
                <strong>Impression Bus</strong>
                <br />
                {connected
                  ? "Connected — receiving flag evaluation events in real time."
                  : "Disconnected — attempting to reconnect to the WebSocket bus."}
              </div>
            )}
          </div>
        </div>
        {events.length === 0 ? (
          <div className="probe-event-empty">Waiting for events...</div>
        ) : (
          events.map((evt, i) => (
            <div
              key={`${evt.timestamp}-${i}`}
              className={`probe-event-entry ${i === 0 ? "probe-event-new" : ""}`}
            >
              <span className="probe-event-time">{formatTime(evt.timestamp)}</span>
              <span className={evt.enabled ? "probe-event-on" : "probe-event-off"}>
                {evt.enabled ? "ON" : "OFF"}
              </span>
              {evt.source && <span className="probe-event-source">{evt.source}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
