import "dotenv/config";
import http from "node:http";
import mqtt from "mqtt";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 3001);
const MQTT_URL = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "utec/gemelo/+/+/+";

const clients = new Set();
let mqttConnected = false;

function sendToSocket(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(message) {
  for (const socket of clients) sendToSocket(socket, message);
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: true,
      mqttConnected,
      mqttUrl: MQTT_URL.replace(/\/\/.*@/, "//***@"),
      topic: MQTT_TOPIC,
      websocketClients: clients.size
    }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: false, error: "Not found" }));
});

const websocketServer = new WebSocketServer({
  server,
  path: "/ws/telemetry"
});

websocketServer.on("connection", (socket) => {
  clients.add(socket);
  sendToSocket(socket, {
    kind: "bridge",
    mqttConnected,
    topic: MQTT_TOPIC
  });

  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

const mqttOptions = {
  clientId: `l419-dashboard-${process.pid}`,
  clean: true,
  connectTimeout: 10000,
  reconnectPeriod: 3000
};

if (process.env.MQTT_USERNAME) mqttOptions.username = process.env.MQTT_USERNAME;
if (process.env.MQTT_PASSWORD) mqttOptions.password = process.env.MQTT_PASSWORD;

const mqttClient = mqtt.connect(MQTT_URL, mqttOptions);

mqttClient.on("connect", () => {
  mqttConnected = true;
  console.log(`[MQTT] Conectado a ${MQTT_URL}`);
  mqttClient.subscribe(MQTT_TOPIC, { qos: 0 }, (error) => {
    if (error) console.error("[MQTT] Error al suscribirse:", error.message);
    else console.log(`[MQTT] Suscrito a ${MQTT_TOPIC}`);
  });
  broadcast({ kind: "bridge", mqttConnected: true, topic: MQTT_TOPIC });
});

mqttClient.on("message", (topic, buffer) => {
  const raw = buffer.toString("utf8");
  let payload = raw;

  try {
    payload = JSON.parse(raw);
  } catch {
    // El estado retenido del Gateway se publica como texto: "online" / "offline".
  }

  broadcast({
    kind: "telemetry",
    topic,
    payload,
    receivedAt: Date.now()
  });
});

mqttClient.on("reconnect", () => {
  mqttConnected = false;
  broadcast({ kind: "bridge", mqttConnected: false, topic: MQTT_TOPIC });
  console.log("[MQTT] Intentando reconectar...");
});

mqttClient.on("close", () => {
  mqttConnected = false;
  broadcast({ kind: "bridge", mqttConnected: false, topic: MQTT_TOPIC });
  console.log("[MQTT] Conexión cerrada.");
});

mqttClient.on("error", (error) => {
  console.error("[MQTT] Error:", error.message);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Bridge] HTTP health: http://localhost:${PORT}/health`);
  console.log(`[Bridge] WebSocket: ws://localhost:${PORT}/ws/telemetry`);
});

function shutdown() {
  console.log("\nCerrando puente MQTT...");
  mqttClient.end(true);
  websocketServer.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
