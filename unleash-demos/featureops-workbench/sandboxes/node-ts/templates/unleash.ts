import { initialize, type Unleash } from "unleash-client";
import { WebSocket } from "ws";
import { once, EventEmitter } from "node:events";

(async () => {
const UNLEASH_URL = process.env.UNLEASH_URL ?? "http://unleash:4242/unleash/api";
const UNLEASH_API_TOKEN = process.env.UNLEASH_API_TOKEN ?? "";

if (!UNLEASH_API_TOKEN) {
  console.error("Error: No Unleash API token configured. Paste your token into the Secret Vault first.");
  process.exit(1);
}

const unleash: Unleash = initialize({
  url: UNLEASH_URL,
  appName: "workbench-repl",
  customHeaders: { Authorization: UNLEASH_API_TOKEN },
  refreshInterval: 1,
});

const bus = new WebSocket("ws://impression-bus:3001");

unleash.on("impression", (event) => {
  if (bus.readyState === WebSocket.OPEN) {
    bus.send(
      JSON.stringify({
        type: "impression",
        flag: event.featureName,
        enabled: event.enabled,
        variant: event.variant,
        context: event.context,
        timestamp: new Date().toISOString(),
        source: "repl",
      })
    );
  }
});

// Wait for the SDK to be ready (fetch toggles from Unleash)
const readyTimeout = setTimeout(() => {
  console.error("Error: Timed out waiting for Unleash SDK to become ready.");
  process.exit(1);
}, 5000);

await once(unleash as unknown as EventEmitter, "ready");
clearTimeout(readyTimeout);

// --- User code begins below ---

##CODE##

// --- User code ends above ---

unleash.destroy();
bus.close();
})();
