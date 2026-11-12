import express from "express";
import { initialize, type Unleash } from "unleash-client";
import { WebSocket } from "ws";
import { readFileSync, writeFileSync } from "fs";
import { router } from "./routes/index.js";
import { router as fragmentsRouter } from "./routes/fragments.js";

const PORT = Number(process.env.PORT ?? 4000);
const UNLEASH_URL = process.env.UNLEASH_URL ?? "http://unleash:4242/unleash/api";
const TOKEN_FILE = "/tmp/.unleash-token";

let unleash: Unleash | null = null;

function initUnleash(token: string) {
  if (unleash) unleash.destroy();
  unleash = initialize({
    url: UNLEASH_URL,
    appName: "workbench-express-api",
    customHeaders: { Authorization: token },
    refreshInterval: 2,
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
          source: "lens-app",
        })
      );
    }
  });

  unleash.on("ready", () => console.log("Unleash SDK ready"));
  unleash.on("error", (err) => console.error("Unleash SDK error:", err.message));

  app.locals.unleash = unleash;
}

const app = express();

// Token update endpoint — called by SecretVault when user pastes a token
app.put("/api/token", (req, res) => {
  let body = "";
  req.setEncoding("utf-8");
  req.on("data", (chunk: string) => (body += chunk));
  req.on("end", () => {
    const token = body.trim();
    if (!token) {
      res.status(400).send("Token required");
      return;
    }
    writeFileSync(TOKEN_FILE, token, "utf-8");
    initUnleash(token);
    res.send("Token updated");
  });
});

app.use("/", router);
app.use("/api/fragments", fragmentsRouter);

// On startup, read token from file (survives nodemon restarts), then env, then skip
let startupToken = "";
try { startupToken = readFileSync(TOKEN_FILE, "utf-8").trim(); } catch {}
if (!startupToken) startupToken = process.env.UNLEASH_API_TOKEN ?? "";

if (startupToken) {
  initUnleash(startupToken);
} else {
  app.locals.unleash = null;
}

app.listen(PORT, () => {
  console.log(`Express API listening on port ${PORT}`);
});
