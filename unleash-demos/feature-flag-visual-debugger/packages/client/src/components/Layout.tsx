import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react';

interface LayoutProps {
  topLeft: ReactNode;
  topRight: ReactNode;
  bottom: (fullscreenButton: ReactNode) => ReactNode;
  topLeftLabel: string;
  topRightLabel: string;
  topLeftUrl?: string;
  topRightUrl?: string;
}

type FullscreenPane = 'topLeft' | 'topRight' | 'bottom' | null;

function FullscreenButton({ isFullscreen, onClick }: { isFullscreen: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-900/80 hover:bg-gray-700/90 rounded cursor-pointer transition-colors z-10 border border-gray-700/50"
      title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    >
      {isFullscreen ? '\u{2716}' : '\u{26F6}'}
    </button>
  );
}

function PaneLabel({ label, url }: { label: string; url?: string }) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-900/80 rounded underline hover:text-gray-200 transition-colors"
      >
        {label}
      </a>
    );
  }
  return (
    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-900/80 rounded pointer-events-none">
      {label}
    </span>
  );
}

export default function Layout({ topLeft, topRight, bottom, topLeftLabel, topRightLabel, topLeftUrl, topRightUrl }: LayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Vertical split: top row height as percentage (0-100)
  const [topPct, setTopPct] = useState(50);
  // Horizontal split: left column width as percentage (0-100)
  const [leftPct, setLeftPct] = useState(50);
  // Fullscreen state
  const [fullscreenPane, setFullscreenPane] = useState<FullscreenPane>(null);
  // Whether a drag is in progress (drives the overlay that blocks iframe mouse capture)
  const [isDragging, setIsDragging] = useState(false);

  const dragging = useRef<'horizontal' | 'vertical' | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current || !dragging.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (dragging.current === 'vertical') {
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setTopPct(Math.min(Math.max(pct, 15), 85));
    } else {
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(Math.max(pct, 15), 85));
    }
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = null;
    setIsDragging(false);
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

  const startDrag = (axis: 'horizontal' | 'vertical') => {
    dragging.current = axis;
    setIsDragging(true);
    document.body.style.cursor = axis === 'vertical' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const toggleFullscreen = useCallback((pane: FullscreenPane) => {
    setFullscreenPane((prev) => (prev === pane ? null : pane));
  }, []);

  const exitButton = <FullscreenButton isFullscreen onClick={() => toggleFullscreen(fullscreenPane)} />;

  // Fullscreen: render only the selected pane
  if (fullscreenPane) {
    const isBottom = fullscreenPane === 'bottom';
    const content = fullscreenPane === 'topLeft' ? topLeft
      : fullscreenPane === 'topRight' ? topRight
      : bottom(exitButton);
    const label = fullscreenPane === 'topLeft' ? topLeftLabel
      : fullscreenPane === 'topRight' ? topRightLabel
      : null;
    const labelUrl = fullscreenPane === 'topLeft' ? topLeftUrl
      : fullscreenPane === 'topRight' ? topRightUrl
      : undefined;

    return (
      <div ref={containerRef} className="h-screen w-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
        <div className="relative flex-1 min-h-0 overflow-hidden">
          {content}
          {!isBottom && (
            <div className="absolute top-1 right-1 flex items-center gap-1.5 z-10">
              {label && <PaneLabel label={label} url={labelUrl} />}
              {exitButton}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-screen w-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden relative">
      {/* Drag overlay — blocks iframes from capturing mouse events during resize */}
      {isDragging && <div className="absolute inset-0 z-50" />}

      {/* Top panes */}
      <div className="flex min-h-0" style={{ height: `${topPct}%` }}>
        {/* Top-left pane */}
        <div className="relative overflow-hidden" style={{ width: `${leftPct}%` }}>
          {topLeft}
          <div className="absolute top-1 right-1 flex items-center gap-1.5 z-10">
            <PaneLabel label={topLeftLabel} url={topLeftUrl} />
            <FullscreenButton isFullscreen={false} onClick={() => toggleFullscreen('topLeft')} />
          </div>
        </div>
        {/* Vertical splitter (between left & right top panes) */}
        <div
          className="w-1 flex-none bg-gray-800 hover:bg-blue-500/50 cursor-col-resize transition-colors"
          onMouseDown={() => startDrag('horizontal')}
        />
        {/* Top-right pane */}
        <div className="relative flex-1 overflow-hidden">
          {topRight}
          <div className="absolute top-1 left-1 flex items-center gap-1.5 z-10">
            <FullscreenButton isFullscreen={false} onClick={() => toggleFullscreen('topRight')} />
            <PaneLabel label={topRightLabel} url={topRightUrl} />
          </div>
        </div>
      </div>
      {/* Horizontal splitter (between top and bottom) */}
      <div
        className="h-1 flex-none bg-gray-800 hover:bg-blue-500/50 cursor-row-resize transition-colors"
        onMouseDown={() => startDrag('vertical')}
      />
      {/* Bottom pane */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {bottom(<FullscreenButton isFullscreen={false} onClick={() => toggleFullscreen('bottom')} />)}
      </div>
    </div>
  );
}
