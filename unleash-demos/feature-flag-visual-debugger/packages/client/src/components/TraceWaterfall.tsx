import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { TracePair, Trace } from '../types/trace';
import TraceSpanBar from './TraceSpanBar';
import SpanDetail from './SpanDetail';

interface TraceWaterfallProps {
  tracePair: TracePair;
  highlightedService: string | null;
  activeTrace: 'off' | 'on' | null;
  onActiveTraceChange: (active: 'off' | 'on' | null) => void;
}

const COLOUR_OFF = '#3B82F6'; // blue
const COLOUR_ON = '#22C55E'; // green

// Left inset (px) inside the timeline column — keeps 0ms/bars clear of the splitter
const TIMELINE_LEFT_INSET = 16;

interface TimeRange {
  startTime: number; // microseconds
  duration: number; // microseconds
}

function computeTraceRange(trace: Trace): TimeRange {
  return { startTime: trace.startTime, duration: trace.duration };
}

function generateTicks(durationUs: number): number[] {
  if (durationUs <= 0) return [0];
  const durationMs = durationUs / 1000;
  const rawStep = durationMs / 6;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let step = candidates.find((c) => c * magnitude >= rawStep) ?? 10;
  step = step * magnitude;
  if (step <= 0) step = 1;

  const ticks: number[] = [];
  for (let t = 0; t <= durationMs + step * 0.01; t += step) {
    ticks.push(Math.round(t * 100) / 100);
  }
  return ticks;
}

/** Estimate the label column width needed to show all span names without truncation. */
function estimateLabelWidth(traces: (Trace | null)[]): number {
  const CHAR_WIDTH = 7; // approx px per char at text-xs
  const BASE_PAD = 24; // px-3 left + right
  let maxWidth = 180; // minimum
  for (const trace of traces) {
    if (!trace) continue;
    for (const span of trace.spans) {
      const indent = 12 + span.depth * 20;
      const textWidth = (span.serviceName.length + 1 + span.operationName.length) * CHAR_WIDTH;
      maxWidth = Math.max(maxWidth, indent + textWidth + BASE_PAD);
    }
  }
  return Math.min(maxWidth, 500);
}

export default function TraceWaterfall({
  tracePair,
  highlightedService,
  activeTrace,
  onActiveTraceChange,
}: TraceWaterfallProps) {
  const { flagOff, flagOn } = tracePair;

  // Auto-compute default label width from trace data
  const defaultLabelWidth = useMemo(
    () => estimateLabelWidth([flagOff, flagOn]),
    [flagOff, flagOn],
  );
  const [labelWidth, setLabelWidth] = useState<number | null>(null);
  const effectiveLabelWidth = labelWidth ?? defaultLabelWidth;

  // Reset to auto when traces change
  useEffect(() => setLabelWidth(null), [defaultLabelWidth]);

  // barPct: percentage of the timeline column used for bars (rest is right margin)
  const [barPct, setBarPct] = useState(80);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'label' | 'bar' | 'split' | null>(null);

  // splitPct: vertical split between flagOff (top) and flagOn (bottom) in comparison mode
  const [splitPct, setSplitPct] = useState(50);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    if (dragging.current === 'label') {
      setLabelWidth(Math.min(Math.max(e.clientX, 120), 500));
    } else if (dragging.current === 'bar' && containerRef.current) {
      // The timeline column starts after the label + splitter
      const rect = containerRef.current.getBoundingClientRect();
      const timelineLeft = rect.left + effectiveLabelWidth + 1; // +1 for splitter
      const timelineWidth = rect.right - timelineLeft;
      if (timelineWidth > 0) {
        const pct = ((e.clientX - timelineLeft - TIMELINE_LEFT_INSET) / (timelineWidth - TIMELINE_LEFT_INSET)) * 100;
        setBarPct(Math.min(Math.max(pct, 40), 100));
      }
    } else if (dragging.current === 'split' && scrollAreaRef.current) {
      const rect = scrollAreaRef.current.getBoundingClientRect();
      if (rect.height > 0) {
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        setSplitPct(Math.min(Math.max(pct, 20), 80));
      }
    }
  }, [effectiveLabelWidth]);

  const onMouseUp = useCallback(() => {
    dragging.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startDragLabel = useCallback(() => {
    dragging.current = 'label';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const startDragBar = useCallback(() => {
    dragging.current = 'bar';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const startDragSplit = useCallback(() => {
    dragging.current = 'split';
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  if (!flagOff && !flagOn) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Select traces to compare
      </div>
    );
  }

  const hasComparison = flagOff !== null && flagOn !== null;

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Colour legend */}
      <div className="flex-none flex items-center gap-5 px-4 py-2 border-b border-gray-800 text-xs text-gray-400">
        {flagOff && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLOUR_OFF }}
            />
            Flag OFF
            <span className="font-mono text-gray-600 ml-1">
              {flagOff.traceId.slice(0, 8)}
            </span>
          </span>
        )}
        {flagOn && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLOUR_ON }}
            />
            Flag ON
            <span className="font-mono text-gray-600 ml-1">
              {flagOn.traceId.slice(0, 8)}
            </span>
          </span>
        )}
      </div>

      {/* Scrollable content */}
      {hasComparison ? (
        <div ref={scrollAreaRef} className="flex-1 min-h-0 flex flex-col">
          <div className="min-h-0 overflow-auto" style={{ flex: splitPct }}>
            <TraceSection
              trace={flagOff!}
              label="Flag OFF"
              colour={COLOUR_OFF}
              highlightedService={highlightedService}
              onSectionActivate={() => onActiveTraceChange('off')}
              isActive={activeTrace === 'off'}
              onActivate={() => onActiveTraceChange(activeTrace === 'off' ? null : 'off')}
              labelWidth={effectiveLabelWidth}
              barPct={barPct}
              onStartDragLabel={startDragLabel}
              onStartDragBar={startDragBar}
            />
          </div>

          {/* Draggable vertical splitter */}
          <div
            className="flex-none mx-2 border-t border-dashed border-gray-700 hover:border-gray-500 cursor-row-resize transition-colors"
            style={{ height: '5px' }}
            onMouseDown={startDragSplit}
          />

          <div className="min-h-0 overflow-auto" style={{ flex: 100 - splitPct }}>
            <TraceSection
              trace={flagOn!}
              label="Flag ON"
              colour={COLOUR_ON}
              highlightedService={highlightedService}
              onSectionActivate={() => onActiveTraceChange('on')}
              isActive={activeTrace === 'on'}
              onActivate={() => onActiveTraceChange(activeTrace === 'on' ? null : 'on')}
              labelWidth={effectiveLabelWidth}
              barPct={barPct}
              onStartDragLabel={startDragLabel}
              onStartDragBar={startDragBar}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          {flagOff && (
            <TraceSection
              trace={flagOff}
              colour={COLOUR_OFF}
              highlightedService={highlightedService}
              isActive={true}
              labelWidth={effectiveLabelWidth}
              barPct={barPct}
              onStartDragLabel={startDragLabel}
              onStartDragBar={startDragBar}
            />
          )}
          {flagOn && (
            <TraceSection
              trace={flagOn}
              colour={COLOUR_ON}
              highlightedService={highlightedService}
              isActive={true}
              labelWidth={effectiveLabelWidth}
              barPct={barPct}
              onStartDragLabel={startDragLabel}
              onStartDragBar={startDragBar}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------- TraceSection ----------

interface TraceSectionProps {
  trace: Trace;
  label?: string;
  colour: string;
  highlightedService: string | null;
  onSectionActivate?: () => void;
  isActive: boolean;
  onActivate?: () => void;
  labelWidth: number;
  barPct: number;
  onStartDragLabel: () => void;
  onStartDragBar: () => void;
}

function TraceSection({
  trace,
  label,
  colour,
  highlightedService,
  onSectionActivate,
  isActive,
  onActivate,
  labelWidth,
  barPct,
  onStartDragLabel,
  onStartDragBar,
}: TraceSectionProps) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const traceRange = useMemo(() => computeTraceRange(trace), [trace]);
  const ticks = useMemo(() => generateTicks(traceRange.duration), [traceRange.duration]);

  // Position a tick within the bar area: barPct% of the timeline, offset by TIMELINE_LEFT_INSET
  const tickLeft = (pct: number) =>
    `calc(${TIMELINE_LEFT_INSET}px + (100% - ${TIMELINE_LEFT_INSET}px) * ${barPct / 100} * ${pct / 100})`;

  return (
    <div
      className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'}`}
      onClick={onSectionActivate}
    >
      {/* Section header */}
      {label && (
        <div
          className={`flex items-center gap-2 px-3 py-1 cursor-pointer select-none ${
            isActive ? 'bg-gray-900/40' : ''
          }`}
          onClick={onActivate}
        >
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: colour }} />
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
          <span className="text-[10px] text-gray-600 ml-auto">
            {(traceRange.duration / 1000).toFixed(1)} ms
          </span>
        </div>
      )}

      {/* Time axis header */}
      <div className="flex sticky top-0 z-10 bg-gray-950 border-b border-gray-800/50">
        <div
          className="flex-none px-3 py-0.5 text-[9px] text-gray-600 uppercase tracking-wider"
          style={{ width: `${labelWidth}px` }}
        >
          {!label && 'Service / Operation'}
        </div>
        {/* Label ↔ timeline splitter */}
        <div
          className="w-1 flex-none bg-gray-800 hover:bg-blue-500/50 cursor-col-resize transition-colors"
          onMouseDown={onStartDragLabel}
        />
        {/* Timeline header with ticks */}
        <div className="flex-1 relative h-5 min-w-0">
          {ticks.map((t) => {
            const pct =
              traceRange.duration > 0 ? ((t * 1000) / traceRange.duration) * 100 : 0;
            return (
              <span
                key={t}
                className="absolute top-0 text-[9px] text-gray-600 font-mono"
                style={{ left: tickLeft(pct), transform: 'translateX(-50%)' }}
              >
                {t}ms
              </span>
            );
          })}
          {/* Bar area right-edge splitter */}
          <div
            className="absolute top-0 h-full w-1 bg-gray-800 hover:bg-blue-500/50 cursor-col-resize transition-colors"
            style={{ left: tickLeft(100) }}
            onMouseDown={onStartDragBar}
          />
        </div>
      </div>

      {/* Span rows */}
      {trace.spans.map((span) => {
        const isSelected = selectedSpanId === span.spanId;
        const isDimmed =
          highlightedService !== null && span.serviceName !== highlightedService;

        return (
          <div key={span.spanId}>
            <div
              className={`flex items-center hover:bg-gray-900/50 ${
                isSelected ? 'bg-gray-800/60' : ''
              }`}
            >
              {/* Label column */}
              <div
                className="flex-none flex items-center gap-1 px-3 py-0.5 overflow-hidden cursor-pointer"
                style={{ width: `${labelWidth}px`, paddingLeft: `${12 + span.depth * 20}px` }}
                onClick={() => {
                  onSectionActivate?.();
                  setSelectedSpanId(prev => prev === span.spanId ? null : span.spanId);
                }}
              >
                <span
                  className={`text-xs truncate ${isDimmed ? 'text-gray-700' : 'text-gray-400'}`}
                  title={`${span.serviceName} — ${span.operationName}`}
                >
                  <span className={isDimmed ? 'text-gray-700' : 'text-gray-300'}>
                    {span.serviceName}
                  </span>
                  {' '}
                  {span.operationName}
                </span>
              </div>

              {/* Splitter spacer */}
              <div className="w-1 flex-none" />

              {/* Timeline column */}
              <div className="flex-1 min-w-0 relative">
                <TraceSpanBar
                  span={span}
                  colour={colour}
                  globalStartTime={traceRange.startTime}
                  globalDuration={traceRange.duration}
                  isSelected={isSelected}
                  isDimmed={isDimmed}
                  onClick={(s) => {
                    onSectionActivate?.();
                    setSelectedSpanId(prev => prev === s.spanId ? null : s.spanId);
                  }}
                  leftInset={TIMELINE_LEFT_INSET}
                  barScale={barPct / 100}
                />
              </div>
            </div>

            {isSelected && <SpanDetail span={span} colour={colour} />}
          </div>
        );
      })}
    </div>
  );
}
