import { useMemo, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { TracePair, Trace } from '../types/trace';
import ServiceMapNode, { type ServiceNodeData } from './ServiceMapNode';

interface ServiceMapProps {
  tracePair: TracePair;
  onNodeClick: (serviceName: string) => void;
  onNodeHover: (serviceName: string | null) => void;
  activeTrace: 'off' | 'on' | null;
}

// ---- Constants ----

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const DAGRE_NODESEP = 120;
const DAGRE_RANKSEP = 140;

const COLOR_OFF = '#3B82F6'; // blue
const COLOR_ON = '#22C55E';  // green
const COLOR_DEFAULT = '#4B5563'; // gray

// Service IDs used as node identifiers
const SVC_BROWSER = 'browser';
const SVC_NGINX = 'nginx';
const SVC_API = 'sample-api';
const SVC_POSTGRES = 'postgresql';
const SVC_UNLEASH = 'unleash-api';

// ---- Topology definition ----
// Nginx serves the Sample App UI (static files) and proxies /api calls to the Java API.
// The Browser renders the UI served by Nginx; user clicks trigger fetch calls through Nginx.

interface ServiceDef {
  id: string;
  label: string;
  serviceType: ServiceNodeData['serviceType'];
}

const SERVICES: ServiceDef[] = [
  { id: SVC_BROWSER, label: 'Browser (Sample App)', serviceType: 'browser' },
  { id: SVC_NGINX, label: 'Nginx', serviceType: 'proxy' },
  { id: SVC_API, label: 'Sample API', serviceType: 'api' },
  { id: SVC_POSTGRES, label: 'PostgreSQL', serviceType: 'database' },
  { id: SVC_UNLEASH, label: 'Unleash API', serviceType: 'flag' },
];

// Each edge is individually defined in the actual call sequence order.
// Requests go down/right, responses come back up/left.
interface SequentialEdge {
  seq: number;       // global sequence number
  source: string;
  target: string;
  label: string;
  isResponse: boolean;
  isSidecar?: boolean;
}

const SEQUENTIAL_EDGES: SequentialEdge[] = [
  // Request chain (going down)
  { seq: 1, source: SVC_BROWSER, target: SVC_NGINX,    label: 'fetch /api/lightbulb', isResponse: false },
  { seq: 2, source: SVC_NGINX,   target: SVC_API,      label: 'proxy_pass',           isResponse: false },
  { seq: 3, source: SVC_API,     target: SVC_UNLEASH,  label: 'flag evaluate',        isResponse: false, isSidecar: true },
  { seq: 4, source: SVC_UNLEASH, target: SVC_API,      label: 'evaluation result',    isResponse: true,  isSidecar: true },
  { seq: 5, source: SVC_API,     target: SVC_POSTGRES, label: 'SELECT query',         isResponse: false },
  { seq: 6, source: SVC_POSTGRES,target: SVC_API,      label: 'result set',           isResponse: true },
  // Response chain (going back up)
  { seq: 7, source: SVC_API,     target: SVC_NGINX,    label: 'upstream response',    isResponse: true },
  { seq: 8, source: SVC_NGINX,   target: SVC_BROWSER,  label: 'JSON response',        isResponse: true },
];

// ---- Helpers ----

/** Map common service names appearing in traces to our canonical IDs. */
function canonicalServiceId(serviceName: string): string | null {
  const lower = serviceName.toLowerCase();
  if (lower.includes('sample-app') || lower.includes('sample_app') || lower.includes('browser'))
    return SVC_BROWSER;
  if (lower.includes('nginx') || lower.includes('reverse-proxy'))
    return SVC_NGINX;
  if (lower.includes('sample-api') || lower.includes('sample_api') || lower.includes('java'))
    return SVC_API;
  if (lower.includes('postgres') || lower.includes('psql') || lower.includes('jdbc'))
    return SVC_POSTGRES;
  if (lower.includes('unleash'))
    return SVC_UNLEASH;
  return null;
}

/** Extract the set of active canonical service IDs from a trace. */
function servicesInTrace(trace: Trace): Set<string> {
  const ids = new Set<string>();
  for (const span of trace.spans) {
    const id = canonicalServiceId(span.serviceName);
    if (id) ids.add(id);
  }
  return ids;
}

/** Find feature flag info from a trace's spans for a given canonical service. */
function flagInfoForService(
  trace: Trace | null,
  serviceId: string,
): { variant: string; key: string } | null {
  if (!trace) return null;
  for (const span of trace.spans) {
    if (canonicalServiceId(span.serviceName) === serviceId && span.featureFlag) {
      return { variant: span.featureFlag.variant, key: span.featureFlag.key };
    }
  }
  return null;
}

/** Find the services that exist in either or both traces. */
function activeServices(tracePair: TracePair): Set<string> {
  const result = new Set<string>();
  if (tracePair.flagOff) {
    for (const id of servicesInTrace(tracePair.flagOff)) result.add(id);
  }
  if (tracePair.flagOn) {
    for (const id of servicesInTrace(tracePair.flagOn)) result.add(id);
  }
  // Always include browser, nginx, and unleash as known logical nodes when any trace is present
  if (result.size > 0) {
    result.add(SVC_BROWSER);
    result.add(SVC_NGINX);
    result.add(SVC_UNLEASH);
  }
  return result;
}

// ---- Dagre layout ----

function computeLayout(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: DAGRE_NODESEP,
    ranksep: DAGRE_RANKSEP,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  // Only add unique source-target pairs for layout
  const seen = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}`;
    const reverseKey = `${edge.target}->${edge.source}`;
    if (!seen.has(key) && !seen.has(reverseKey)) {
      seen.add(key);
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const layoutNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  // Adjust Unleash API node to be a sidecar — offset to the right of sample-api
  const apiNode = layoutNodes.find((n) => n.id === SVC_API);
  const unleashNode = layoutNodes.find((n) => n.id === SVC_UNLEASH);
  if (apiNode && unleashNode) {
    unleashNode.position = {
      x: apiNode.position.x + NODE_WIDTH + DAGRE_NODESEP,
      y: apiNode.position.y,
    };
  }

  return { nodes: layoutNodes, edges };
}

// ---- Edge construction ----

function getEdgeColor(
  activeTrace: 'off' | 'on' | null,
  hasOff: boolean,
  hasOn: boolean,
): string {
  if (activeTrace === 'off' && hasOff) return COLOR_OFF;
  if (activeTrace === 'on' && hasOn) return COLOR_ON;
  if (activeTrace === null) {
    if (hasOff && hasOn) return COLOR_ON;
    if (hasOn) return COLOR_ON;
    if (hasOff) return COLOR_OFF;
  }
  return COLOR_DEFAULT;
}

/** Determine which handles to use based on edge direction (vertical vs sidecar). */
function getHandles(edge: SequentialEdge): { sourceHandle: string; targetHandle: string } {
  const suffix = edge.isResponse ? 'res' : 'req';
  if (edge.isSidecar) {
    // Sidecar: right/left handles between API and Unleash
    return edge.isResponse
      ? { sourceHandle: `left-${suffix}`, targetHandle: `right-${suffix}` }
      : { sourceHandle: `right-${suffix}`, targetHandle: `left-${suffix}` };
  }
  // Vertical: determine direction from the node ordering
  const sourceIdx = SERVICES.findIndex(s => s.id === edge.source);
  const targetIdx = SERVICES.findIndex(s => s.id === edge.target);
  const goingDown = targetIdx > sourceIdx;
  return goingDown
    ? { sourceHandle: `bottom-${suffix}`, targetHandle: `top-${suffix}` }
    : { sourceHandle: `top-${suffix}`, targetHandle: `bottom-${suffix}` };
}

function buildEdges(
  seqEdges: SequentialEdge[],
  hasOff: boolean,
  hasOn: boolean,
  activeTrace: 'off' | 'on' | null,
): Edge[] {
  const color = getEdgeColor(activeTrace, hasOff, hasOn);
  const isActive = hasOff || hasOn;

  return seqEdges.map((e) => {
    const { sourceHandle, targetHandle } = getHandles(e);
    const isRes = e.isResponse;

    // Offset labels so request/response labels on parallel edges don't overlap.
    // Vertical edges: request curves left → shift label left; response curves right → shift right.
    // Sidecar edges: request on top → shift up; response on bottom → shift down.
    let labelTransform: string;
    if (e.isSidecar) {
      labelTransform = isRes ? 'translateY(14px)' : 'translateY(-14px)';
    } else {
      labelTransform = isRes ? 'translateX(70px)' : 'translateX(-70px)';
    }

    return {
      id: `seq-${e.seq}`,
      source: e.source,
      target: e.target,
      sourceHandle,
      targetHandle,
      type: 'default', // bezier — curves naturally
      label: `${e.seq}. ${e.label}`,
      labelStyle: {
        fill: isRes ? '#6B7280' : '#9CA3AF',
        fontSize: isRes ? 8 : 9,
        fontWeight: isRes ? 400 : 500,
        fontStyle: isRes ? 'italic' : 'normal',
        transform: labelTransform,
      },
      labelBgStyle: {
        fill: '#111827',
        fillOpacity: 0.9,
        transform: labelTransform,
      },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
      style: {
        stroke: isActive ? color : COLOR_DEFAULT,
        strokeWidth: isRes ? 1.5 : (isActive ? 2 : 1.5),
        strokeDasharray: isRes ? '4 3' : undefined,
        opacity: isRes ? 0.6 : 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isActive ? color : COLOR_DEFAULT,
        width: isRes ? 12 : 14,
        height: 10,
      },
      animated: isActive && !isRes,
    } satisfies Edge;
  });
}

// ---- Node types registry (must be stable reference) ----
const nodeTypes = { serviceNode: ServiceMapNode };

// ---- Component ----

function ServiceMapInner({ tracePair, onNodeClick, onNodeHover, activeTrace }: ServiceMapProps) {
  const hasAnyTrace = !!(tracePair.flagOff || tracePair.flagOn);
  const { fitView } = useReactFlow();

  const { computedNodes, computedEdges } = useMemo(() => {
    if (!hasAnyTrace) {
      return { computedNodes: [] as Node[], computedEdges: [] as Edge[] };
    }

    const active = activeServices(tracePair);
    const hasOff = !!tracePair.flagOff;
    const hasOn = !!tracePair.flagOn;

    // Determine which trace to show flag info from based on activeTrace
    const displayTrace = activeTrace === 'off' ? tracePair.flagOff
      : activeTrace === 'on' ? tracePair.flagOn
      : (tracePair.flagOn ?? tracePair.flagOff);

    // Build nodes
    const rawNodes: Node[] = SERVICES.map((svc) => {
      const flagInfo = flagInfoForService(displayTrace, svc.id);

      const nodeData: ServiceNodeData = {
        label: svc.label,
        serviceType: svc.serviceType,
        flagVariant: flagInfo?.variant ?? null,
        flagKey: flagInfo?.key ?? null,
        isActive: active.has(svc.id),
      };

      return {
        id: svc.id,
        type: 'serviceNode',
        position: { x: 0, y: 0 },
        data: nodeData,
      };
    });

    const rawEdges = buildEdges(SEQUENTIAL_EDGES, hasOff, hasOn, activeTrace);

    const laid = computeLayout(rawNodes, rawEdges);
    return { computedNodes: laid.nodes, computedEdges: laid.edges };
  }, [tracePair, hasAnyTrace, activeTrace]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick(node.id);
    },
    [onNodeClick],
  );

  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeHover(node.id);
    },
    [onNodeHover],
  );

  const handleNodeMouseLeave = useCallback(() => {
    onNodeHover(null);
  }, [onNodeHover]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 300 });
  }, [fitView]);

  if (!hasAnyTrace) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-2">
        <span className="text-2xl">{'\u{1F5FA}\u{FE0F}'}</span>
        <span>Load traces to view the service map</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#374151" />
      </ReactFlow>

      {/* Fit-to-view button */}
      <button
        onClick={handleFitView}
        className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-2 py-1.5 rounded border border-gray-600 cursor-pointer transition-colors z-10"
        title="Fit map to view"
      >
        Fit View
      </button>

      {/* Colour legend */}
      <div className="absolute bottom-2 left-2 flex gap-3 text-[10px] text-gray-400 bg-gray-900/80 rounded px-2 py-1 pointer-events-none">
        {tracePair.flagOff && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-0.5 rounded"
              style={{ backgroundColor: COLOR_OFF }}
            />
            Flag OFF
          </span>
        )}
        {tracePair.flagOn && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-0.5 rounded"
              style={{ backgroundColor: COLOR_ON }}
            />
            Flag ON
          </span>
        )}
      </div>
    </div>
  );
}

export default function ServiceMap(props: ServiceMapProps) {
  return (
    <ReactFlowProvider>
      <ServiceMapInner {...props} />
    </ReactFlowProvider>
  );
}
