import { useEffect, useRef, useState, useCallback } from "react";
import type { ImpressionEvent } from "../types/impression.js";

interface UseImpressionBusOptions {
  filter?: (event: ImpressionEvent) => boolean;
  maxEvents?: number;
}

interface UseImpressionBusResult {
  events: ImpressionEvent[];
  connected: boolean;
}

export function useImpressionBus(
  url: string,
  options: UseImpressionBusOptions = {}
): UseImpressionBusResult {
  const { filter, maxEvents = 20 } = options;
  const [events, setEvents] = useState<ImpressionEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (msg) => {
      try {
        const event: ImpressionEvent = JSON.parse(msg.data as string);
        if (event.type !== "impression") return;
        if (filter && !filter(event)) return;
        setEvents((prev) => [event, ...prev].slice(0, maxEvents));
      } catch {
        // drop malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (!mountedRef.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 10000);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, filter, maxEvents]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { events, connected };
}
