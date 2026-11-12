import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 3001);
const wss = new WebSocketServer({ port: PORT });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`Client connected (total: ${clients.size})`);

  ws.on("message", (raw) => {
    let data: string;
    try {
      data = typeof raw === "string" ? raw : raw.toString("utf-8");
      JSON.parse(data); // validate JSON
    } catch {
      return; // drop malformed messages
    }

    for (const client of clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`Client disconnected (total: ${clients.size})`);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    clients.delete(ws);
  });
});

console.log(`Impression bus listening on port ${PORT}`);
