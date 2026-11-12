interface LightbulbProps {
  colour: string | null;
}

function Lightbulb({ colour }: LightbulbProps) {
  const isLit = colour !== null;

  // Dynamic glow layers for the lit state
  const glowShadow = isLit
    ? `0 0 20px ${colour}, 0 0 60px ${colour}, 0 0 100px ${colour}88, 0 0 160px ${colour}44`
    : 'none';

  const bulbBackground = isLit
    ? `radial-gradient(ellipse at 50% 40%, ${colour}dd 0%, ${colour}99 40%, ${colour}55 70%, ${colour}22 100%)`
    : 'radial-gradient(ellipse at 50% 40%, #555 0%, #3a3a3a 40%, #2a2a2a 70%, #222 100%)';

  // Filament glow when lit
  const filamentColour = isLit ? colour : '#444';
  const filamentGlow = isLit
    ? `0 0 6px ${colour}, 0 0 12px ${colour}aa`
    : 'none';

  return (
    <div style={{ display: 'inline-block', position: 'relative', transform: 'scale(0.7)', transformOrigin: 'top center' }}>
      {/* Ambient glow behind the bulb */}
      {isLit && (
        <div
          style={{
            position: 'absolute',
            top: -30,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${colour}22 0%, transparent 70%)`,
            pointerEvents: 'none',
            transition: 'opacity 0.6s ease',
          }}
        />
      )}

      {/* Glass bulb */}
      <div
        style={{
          width: 120,
          height: 140,
          borderRadius: '50% 50% 35% 35% / 60% 60% 40% 40%',
          background: bulbBackground,
          boxShadow: glowShadow,
          border: `2px solid ${isLit ? colour + '66' : '#444'}`,
          position: 'relative',
          margin: '0 auto',
          transition: 'all 0.6s ease',
          overflow: 'hidden',
        }}
      >
        {/* Glass reflection highlight */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 18,
            width: 35,
            height: 50,
            borderRadius: '50%',
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
        />

        {/* Filament structure */}
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
          }}
        >
          {/* Support wires */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
            <div
              style={{
                width: 2,
                height: 40,
                background: `linear-gradient(to top, #666, ${filamentColour})`,
                boxShadow: filamentGlow,
                borderRadius: 1,
                transition: 'all 0.6s ease',
              }}
            />
            <div
              style={{
                width: 2,
                height: 40,
                background: `linear-gradient(to top, #666, ${filamentColour})`,
                boxShadow: filamentGlow,
                borderRadius: 1,
                transition: 'all 0.6s ease',
              }}
            />
          </div>
          {/* Coiled filament */}
          <svg
            width="30"
            height="20"
            viewBox="0 0 30 20"
            style={{
              position: 'absolute',
              top: 2,
              left: '50%',
              transform: 'translateX(-50%)',
              filter: isLit ? `drop-shadow(0 0 4px ${colour})` : 'none',
              transition: 'filter 0.6s ease',
            }}
          >
            <path
              d="M 5 18 Q 8 2, 11 18 Q 14 2, 17 18 Q 20 2, 23 18"
              fill="none"
              stroke={filamentColour ?? '#444'}
              strokeWidth="2"
              strokeLinecap="round"
              style={{ transition: 'stroke 0.6s ease' }}
            />
          </svg>
        </div>
      </div>

      {/* Neck / glass-to-base transition */}
      <div
        style={{
          width: 50,
          height: 12,
          margin: '0 auto',
          background: 'linear-gradient(to bottom, #333, #444)',
          borderLeft: '2px solid #555',
          borderRight: '2px solid #555',
        }}
      />

      {/* Screw base */}
      <div
        style={{
          width: 48,
          margin: '0 auto',
          position: 'relative',
        }}
      >
        {/* Screw threads — a series of ridges */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: 48 - i * 2,
              height: 6,
              margin: '0 auto',
              background:
                i % 2 === 0
                  ? 'linear-gradient(to bottom, #8a8a8a, #6a6a6a)'
                  : 'linear-gradient(to bottom, #6a6a6a, #8a8a8a)',
              borderLeft: '1px solid #999',
              borderRight: '1px solid #999',
              borderBottom: '1px solid #555',
            }}
          />
        ))}
        {/* Contact point at bottom */}
        <div
          style={{
            width: 20,
            height: 8,
            margin: '0 auto',
            background: 'linear-gradient(to bottom, #777, #555)',
            borderRadius: '0 0 4px 4px',
            border: '1px solid #888',
            borderTop: 'none',
          }}
        />
      </div>
    </div>
  );
}

export default Lightbulb;
