import { useState, useCallback } from 'react';
import './otel'; // side-effect: initializes OTel SDK
import { getSessionId, tracer, withSessionBaggage } from './otel';
import Lightbulb from './components/Lightbulb';
import ToggleSwitch from './components/ToggleSwitch';

function App() {
  const [colour, setColour] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);
  const [copied, setCopied] = useState(false);

  const sessionId = getSessionId();

  const handleToggle = useCallback(() => {
    setSwitchOn((prev) => {
      const next = !prev;
      if (!next) {
        setColour(null);
        return next;
      }
      setLoading(true);
      tracer.startActiveSpan('lightbulb.toggle', (span) => {
        span.setAttribute('session.id', sessionId);
        withSessionBaggage(() => {
          fetch('/api/lightbulb')
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then((data: { colour: string }) => {
              setColour(data.colour);
            })
            .catch((err) => {
              console.error('Failed to fetch lightbulb colour:', err);
              setColour(null);
            })
            .finally(() => {
              setLoading(false);
              span.end();
            });
        });
      });
      return next;
    });
  }, []);

  const handleCopySession = useCallback(() => {
    navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [sessionId]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        height: '100vh',
        padding: '16px 12px',
        boxSizing: 'border-box',
      }}
    >
      <Lightbulb colour={colour} />

      <ToggleSwitch on={switchOn} onToggle={handleToggle} loading={loading} />

      <div
        style={{
          fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
          fontSize: '0.65rem',
          color: '#888',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <span>Session: {sessionId}</span>
        <button
          onClick={handleCopySession}
          style={{
            background: 'transparent',
            border: '1px solid #555',
            borderRadius: 4,
            color: '#aaa',
            fontSize: '0.6rem',
            padding: '1px 6px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#999';
            e.currentTarget.style.color = '#ddd';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#555';
            e.currentTarget.style.color = '#aaa';
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default App;
