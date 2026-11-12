import { useState, useEffect } from "react";

const STORAGE_KEY = "workbench:unleash-token";

export function SecretVault() {
  const [token, setToken] = useState("");
  const [masked, setMasked] = useState(true);
  const [status, setStatus] = useState<"empty" | "saved">("empty");

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setToken(stored);
      setStatus("saved");
      // Ensure express-api has the token on page load
      fetch("/app/api/token", { method: "PUT", body: stored }).catch(() => {});
    }
  }, []);

  function handleChange(value: string) {
    setToken(value);
    if (value.trim()) {
      const trimmed = value.trim();
      sessionStorage.setItem(STORAGE_KEY, trimmed);
      setStatus("saved");
      window.dispatchEvent(new CustomEvent("workbench:token-updated"));
      // Push token to express-api so it can connect to Unleash
      fetch("/app/api/token", { method: "PUT", body: trimmed }).catch(() => {});
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      setStatus("empty");
    }
  }

  const saved = status === "saved";

  return (
    <div className="secret-vault">
      <div className="secret-vault-header">
        <div className="secret-vault-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <circle cx="12" cy="16" r="1" />
          </svg>
        </div>
        <span className="secret-vault-title">Secret Vault</span>
        <span className={`secret-vault-status ${saved ? "saved" : ""}`}>
          {saved ? "Secured" : "Empty"}
        </span>
      </div>

      <div className="secret-vault-body">
        <div className="secret-vault-input-row">
          <input
            id="vault-token"
            type={masked ? "password" : "text"}
            value={token}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="server-side API token"
            className="secret-vault-input"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setMasked(!masked)}
            className="secret-vault-toggle"
            aria-label={masked ? "Reveal token" : "Conceal token"}
            title={masked ? "Reveal token" : "Conceal token"}
          >
            {masked ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="secret-vault-rivets" aria-hidden="true">
        <span className="secret-vault-rivet" />
        <span className="secret-vault-rivet" />
        <span className="secret-vault-rivet" />
        <span className="secret-vault-rivet" />
      </div>
    </div>
  );
}
