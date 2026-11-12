import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react';

interface BottomPaneProps {
  filter: ReactNode;
  waterfall: ReactNode;
  serviceMap: ReactNode;
  fullscreenButton?: ReactNode;
}

export default function BottomPane({ filter, waterfall, serviceMap, fullscreenButton }: BottomPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Service map width as percentage from the right (0-100)
  const [mapPct, setMapPct] = useState(35);
  const dragging = useRef(false);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pctFromRight = ((rect.right - e.clientX) / rect.width) * 100;
    setMapPct(Math.min(Math.max(pctFromRight, 15), 70));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
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

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex-none border-b border-gray-800 px-4 py-2 flex items-center gap-2">
        <div className="flex-1 min-w-0">{filter}</div>
        {fullscreenButton}
      </div>
      {/* Content area */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-auto">
          {waterfall}
        </div>
        <div
          className="w-1 flex-none bg-gray-800 hover:bg-blue-500/50 cursor-col-resize transition-colors"
          onMouseDown={() => {
            dragging.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        />
        <div className="overflow-hidden" style={{ width: `${mapPct}%` }}>
          {serviceMap}
        </div>
      </div>
    </div>
  );
}
