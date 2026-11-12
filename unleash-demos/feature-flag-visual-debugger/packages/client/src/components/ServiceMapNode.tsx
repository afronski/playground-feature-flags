import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import FlagBadge from './FlagBadge';

export interface ServiceNodeData {
  label: string;
  serviceType: 'browser' | 'proxy' | 'api' | 'database' | 'flag';
  flagVariant?: string | null;
  flagKey?: string | null;
  isActive: boolean;
  [key: string]: unknown;
}

const SERVICE_ICONS: Record<ServiceNodeData['serviceType'], string> = {
  browser: '\u{1F310}',
  proxy: '\u{1F500}',
  api: '\u{2699}\u{FE0F}',
  database: '\u{1F5C4}\u{FE0F}',
  flag: '\u{1F6A9}',
};

const SERVICE_TYPE_LABELS: Record<ServiceNodeData['serviceType'], string> = {
  browser: 'Browser',
  proxy: 'Web Server + Reverse Proxy',
  api: 'Java API',
  database: 'Database',
  flag: 'The FeatureOps Platform',
};

// Handle offsets: far enough apart for bezier curves to diverge and labels not to overlap.
// "req" handles for request direction, "res" handles for response direction.
const H_REQ = '38%';
const H_RES = '62%';

function ServiceMapNode({ data }: NodeProps) {
  const nodeData = data as unknown as ServiceNodeData;
  const { label, serviceType, flagVariant, flagKey, isActive } = nodeData;

  const borderColor = isActive ? 'border-gray-500' : 'border-gray-700';
  const bgColor = isActive ? 'bg-gray-800' : 'bg-gray-900';

  return (
    <div
      className={`rounded-lg border-2 ${borderColor} ${bgColor} px-4 py-3 min-w-[180px] shadow-lg`}
    >
      {/* Top: req-in (target) + res-out (source) — look like one dot */}
      <Handle type="target" position={Position.Top} id="top-req"
        className="!bg-gray-500 !w-2 !h-2 !border-0" style={{ left: H_REQ }} />
      <Handle type="source" position={Position.Top} id="top-res"
        className="!bg-gray-500 !w-2 !h-2 !border-0" style={{ left: H_RES }} />

      {/* Bottom: req-out (source) + res-in (target) — look like one dot */}
      <Handle type="source" position={Position.Bottom} id="bottom-req"
        className="!bg-gray-500 !w-2 !h-2 !border-0" style={{ left: H_REQ }} />
      <Handle type="target" position={Position.Bottom} id="bottom-res"
        className="!bg-gray-500 !w-2 !h-2 !border-0" style={{ left: H_RES }} />

      {/* Right side: req-out (source) + res-in (target) — for sidecar outgoing */}
      <Handle type="source" position={Position.Right} id="right-req"
        className="!bg-gray-500 !w-2 !h-2 !border-0" style={{ top: '35%' }} />
      <Handle type="target" position={Position.Right} id="right-res"
        className="!bg-gray-500 !w-2 !h-2 !border-0" style={{ top: '65%' }} />

      {/* Left side: req-in (target) + res-out (source) — for sidecar incoming */}
      <Handle type="target" position={Position.Left} id="left-req"
        className="!bg-gray-500 !w-2 !h-2 !border-0" style={{ top: '35%' }} />
      <Handle type="source" position={Position.Left} id="left-res"
        className="!bg-gray-500 !w-2 !h-2 !border-0" style={{ top: '65%' }} />

      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{SERVICE_ICONS[serviceType]}</span>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-gray-100 truncate">{label}</span>
          <span className="text-[10px] text-gray-400">{SERVICE_TYPE_LABELS[serviceType]}</span>
        </div>
      </div>
      {flagVariant && (
        <div className="mt-2">
          <FlagBadge variant={flagVariant} flagKey={flagKey ?? undefined} />
        </div>
      )}
    </div>
  );
}

export default memo(ServiceMapNode);
