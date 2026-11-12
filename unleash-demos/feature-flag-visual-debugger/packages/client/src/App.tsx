import { useState, useCallback, useEffect } from 'react';
import Layout from './components/Layout';
import IframePane from './components/IframePane';
import BottomPane from './components/BottomPane';
import TraceFilter from './components/TraceFilter';
import TraceWaterfall from './components/TraceWaterfall';
import ServiceMap from './components/ServiceMap';
import { useTraces } from './hooks/useTraces';
import type { TracePair } from './types/trace';

// Map service map node IDs to span serviceName values from jaeger.ts
const NODE_TO_SPAN_SERVICE: Record<string, string> = {
  'browser': 'sample-app',
  'unleash-api': 'unleash',
  // These already match: 'sample-api', 'postgresql', 'nginx'
};

function resolveServiceName(nodeId: string): string {
  return NODE_TO_SPAN_SERVICE[nodeId] ?? nodeId;
}

export default function App() {
  const { traces, loading, error, fetchTraces } = useTraces();
  const [tracePair, setTracePair] = useState<TracePair>({ flagOff: null, flagOn: null });
  const [highlightedService, setHighlightedService] = useState<string | null>(null);
  const [activeTrace, setActiveTrace] = useState<'off' | 'on' | null>(null);

  // Auto-detect trace pair when traces change
  useEffect(() => {
    if (traces.length === 0) return;
    const offTrace = traces.find(t => t.flagVariant === 'disabled') ?? null;
    const onTrace = traces.find(t => t.flagVariant === 'enabled') ?? null;
    if (offTrace || onTrace) {
      setTracePair({ flagOff: offTrace, flagOn: onTrace });
    }
  }, [traces]);

  const handleTracePairChange = useCallback((pair: TracePair) => {
    setTracePair(pair);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setHighlightedService(resolveServiceName(nodeId));
  }, []);

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setHighlightedService(nodeId ? resolveServiceName(nodeId) : null);
  }, []);

  return (
    <Layout
      topLeft={<IframePane src="http://localhost:4242" title="Unleash" />}
      topRight={<IframePane src="http://localhost:8081" title="Sample App" />}
      topLeftLabel="Unleash"
      topLeftUrl="http://localhost:4242"
      topRightLabel="Example App (Lightbulb API)"
      topRightUrl="http://localhost:8081"
      bottom={(fullscreenButton) =>
        <BottomPane
          fullscreenButton={fullscreenButton}
          filter={
            <TraceFilter
              traces={traces}
              loading={loading}
              error={error}
              onFetchTraces={fetchTraces}
              tracePair={tracePair}
              onTracePairChange={handleTracePairChange}
              version={__APP_VERSION__}
            />
          }
          waterfall={
            <TraceWaterfall
              tracePair={tracePair}
              highlightedService={highlightedService}
              activeTrace={activeTrace}
              onActiveTraceChange={setActiveTrace}
            />
          }
          serviceMap={
            <ServiceMap
              tracePair={tracePair}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              activeTrace={activeTrace}
            />
          }
        />
      }
    />
  );
}
