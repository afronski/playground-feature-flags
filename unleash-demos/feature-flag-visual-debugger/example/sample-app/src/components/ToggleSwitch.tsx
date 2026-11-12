interface ToggleSwitchProps {
  on: boolean;
  onToggle: () => void;
  loading: boolean;
}

function ToggleSwitch({ on, onToggle, loading }: ToggleSwitchProps) {
  return (
    <div
      style={{
        display: 'inline-block',
        cursor: loading ? 'wait' : 'pointer',
        userSelect: 'none',
      }}
      onClick={loading ? undefined : onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!loading && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-label={on ? 'Turn light off' : 'Turn light on'}
    >
      {/* Wall plate */}
      <div
        style={{
          width: 80,
          height: 128,
          borderRadius: 12,
          background: 'linear-gradient(145deg, #d4d4d4, #e8e8e8)',
          boxShadow: `
            4px 4px 12px rgba(0, 0, 0, 0.4),
            -2px -2px 8px rgba(255, 255, 255, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.3),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1)
          `,
          border: '1px solid #bbb',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: loading ? 'switchPulse 1.2s ease-in-out infinite' : 'none',
        }}
      >
        {/* Screw holes */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #aaa, #999)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          {/* Screw slot */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(30deg)',
              width: 6,
              height: 1.5,
              background: '#777',
              borderRadius: 1,
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #aaa, #999)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-15deg)',
              width: 6,
              height: 1.5,
              background: '#777',
              borderRadius: 1,
            }}
          />
        </div>

        {/* Toggle recess / opening */}
        <div
          style={{
            width: 36,
            height: 56,
            borderRadius: 6,
            background: 'linear-gradient(to bottom, #666, #555)',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6), inset 0 -1px 2px rgba(0,0,0,0.3)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* The paddle / lever */}
          <div
            style={{
              position: 'absolute',
              left: 3,
              right: 3,
              height: 30,
              borderRadius: 4,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              // ON = lever pushed down (bottom), OFF = lever pushed up (top)
              top: on ? 4 : 22,
              background: on
                ? 'linear-gradient(to bottom, #c0c0c0, #a8a8a8)'
                : 'linear-gradient(to bottom, #d0d0d0, #b8b8b8)',
              boxShadow: on
                ? `
                    0 2px 4px rgba(0,0,0,0.3),
                    0 -2px 1px rgba(255,255,255,0.1),
                    inset 0 1px 0 rgba(255,255,255,0.5),
                    inset 0 -1px 0 rgba(0,0,0,0.1)
                  `
                : `
                    0 -2px 4px rgba(0,0,0,0.3),
                    0 2px 1px rgba(255,255,255,0.1),
                    inset 0 1px 0 rgba(255,255,255,0.4),
                    inset 0 -1px 0 rgba(0,0,0,0.15)
                  `,
              border: '1px solid #999',
            }}
          >
            {/* Paddle texture — horizontal ridges */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                opacity: 0.4,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 18,
                    height: 1.5,
                    background: '#666',
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ON / OFF labels */}
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: 23,
            fontSize: '0.5rem',
            fontWeight: 700,
            color: on ? '#666' : '#999',
            letterSpacing: '0.05em',
            transition: 'color 0.2s',
          }}
        >
          ON
        </div>
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 23,
            fontSize: '0.5rem',
            fontWeight: 700,
            color: on ? '#999' : '#666',
            letterSpacing: '0.05em',
            transition: 'color 0.2s',
          }}
        >
          OFF
        </div>
      </div>

      {/* Pulse animation keyframes */}
      <style>
        {`
          @keyframes switchPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.85; }
          }
        `}
      </style>
    </div>
  );
}

export default ToggleSwitch;
