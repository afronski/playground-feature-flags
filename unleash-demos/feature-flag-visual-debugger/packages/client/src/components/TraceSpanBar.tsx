import type { Span } from '../types/trace';
import FlagBadge from './FlagBadge';

interface TraceSpanBarProps {
  span: Span;
  colour: string;
  globalStartTime: number;
  globalDuration: number;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: (span: Span) => void;
  leftInset: number;  // px offset from left edge
  barScale: number;   // 0-1, fraction of timeline width used for bars
}

export default function TraceSpanBar({
  span,
  colour,
  globalStartTime,
  globalDuration,
  isSelected,
  isDimmed,
  onClick,
  leftInset,
  barScale,
}: TraceSpanBarProps) {
  const offsetFrac =
    globalDuration > 0 ? (span.startTime - globalStartTime) / globalDuration : 0;
  const widthFrac =
    globalDuration > 0 ? Math.max(span.duration / globalDuration, 0.003) : 0;
  const durationMs = (span.duration / 1000).toFixed(1);

  // Position within the scaled bar area: leftInset + fraction * (availableWidth * barScale)
  // Using calc(): leftInset + pct * barScale * (100% - leftInset)
  const barLeft = `calc(${leftInset}px + (100% - ${leftInset}px) * ${barScale} * ${offsetFrac})`;
  const barWidth = `calc((100% - ${leftInset}px) * ${barScale} * ${widthFrac})`;
  const labelLeft = `calc(${leftInset}px + (100% - ${leftInset}px) * ${barScale} * ${offsetFrac + widthFrac} + 6px)`;

  return (
    <div
      className="relative h-6 w-full cursor-pointer group"
      onClick={() => onClick(span)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(span);
      }}
    >
      {/* Duration bar */}
      <div
        className="absolute top-0.5 h-5 rounded-sm transition-opacity"
        style={{
          left: barLeft,
          width: barWidth,
          backgroundColor: colour,
          opacity: isDimmed ? 0.25 : isSelected ? 1 : 0.8,
        }}
      />

      {/* Duration label — positioned after the bar, never clipped */}
      <span
        className="absolute top-0.5 h-5 flex items-center text-[10px] font-mono text-gray-400 pointer-events-none whitespace-nowrap"
        style={{ left: labelLeft }}
      >
        {durationMs} ms
        {span.featureFlag && (
          <span className="ml-1.5">
            <FlagBadge variant={span.featureFlag.variant} flagKey={span.featureFlag.key} />
          </span>
        )}
      </span>
    </div>
  );
}
