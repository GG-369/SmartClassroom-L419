// Puente para el gateway AP L419: HTTP JSONL -> WebSocket compatible con frontend/src/hooks/useTelemetry.js
// Node 18+; dependencia: ws (ya presente en backend-mqtt-bridge/package.json)
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 3001);
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://192.168.4.1').replace(/\/$/, '');
const POLL_MS = Math.max(400, Number(process.env.GATEWAY_POLL_MS || 1000));
const TIMEOUT_MS = 3500;
const TOPIC_BASE = 'utec/gemelo/l419';
const NODE_TYPES = new Set(['co2','audio','gas','luz','termico','magnetico','ambiente']);
let connected = false;
let lastId = null;
let lastPollAt = null;
let lastError = null;
let lastSyncAt = 0;
let busy = false;
const clients = new Set();

function send(socket, obj) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
}
function broadcast(obj) { for (const socket of clients) send(socket, obj); }
function sensorEvent(msg, bootstrap = false) {
  if (!msg || !NODE_TYPES.has(msg.tipo)) return;
  // La última muestra que entrega /api/ultimos es una instantánea, no un cruce nuevo.
  // Evita sumar una segunda vez sus entradas/salidas al abrir la página.
  const payload = bootstrap && msg.tipo === 'termico'
    ? { ...msg, entradas: 0, salidas: 0 }
    : msg;
  broadcast({ kind:'telemetry', topic:`${TOPIC_BASE}/${msg.tipo}`, payload, receivedAt:Date.now() });
}
function bridgeEvent() { broadcast({ kind:'bridge', mqttConnected:connected, source:'gateway-http' }); }
function gatewayEvent() {
  broadcast({ kind:'telemetry', topic:`${TOPIC_BASE}/gateway/estado`, payload:connected?'online':'offline', receivedAt:Date.now() });
}
function setOnline(next, error=null) {
  lastError = error;
  if (connected === next) return;
  connected = next;
  console.log(`[Gateway] ${next?'Conectado':'Desconectado'}: ${GATEWAY_URL}${error?' ('+error+')':''}`);
  bridgeEvent(); gatewayEvent();
}
async function fetchText(path) {
  const response = await fetch(GATEWAY_URL + path, {signal: AbortSignal.timeout(TIMEOUT_MS), cache:'no-store'});
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  return response.text();
}
async function fetchJson(path) { return JSON.parse(await fetchText(path)); }
async function syncClock() {
  // El ESP32 AP no tiene internet: el reloj del gateway se ajusta desde la laptop.
  if (Date.now() - lastSyncAt < 60000) return;
  await fetchJson(`/api/hora?epoch_ms=${Date.now()}`);
  lastSyncAt = Date.now();
}
async function poll() {
  if (busy) return;
  busy = true;
  try {
    const state = await fetchJson('/api/estado');
    const newestId = Number(state.id_ultimo);
    if (!Number.isSafeInteger(newestId) || newestId < 0) throw Error('id_ultimo inválido');
    await syncClock();
    if (lastId === null || newestId < lastId) {
      // Inicialización o reinicio del gateway: mostrar estado actual sin repetir cruces.
      lastId = newestId;
      const latest = await fetchJson('/api/ultimos');
      if (Array.isArray(latest)) for (const item of latest) {
        if (item?.msg && item.hace_s >= 0) sensorEvent(item.msg, true);
      }
    }
    // Pedir desde el último ID recibido, evitando perder eventos entre consultas.
    // Los datos son JSONL: una línea por paquete recibido por el gateway.
    let iterations = 0;
    while (lastId < newestId && iterations++ < 10) {
      const jsonl = await fetchText(`/api/datos?desde=${lastId}&max=500`);
      const events = jsonl.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
      let progressed = false;
      for (const event of events) {
        const id = Number(event.id);
        if (!Number.isSafeInteger(id) || id <= lastId) continue;
        lastId = id;
        sensorEvent(event, false);
        progressed = true;
      }
      if (!progressed || events.length < 500) break;
    }
    lastPollAt = Date.now();
    setOnline(true);
  } catch (e) {
    setOnline(false, e.message);
  } finally { busy = false; }
}
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'});
    res.end(JSON.stringify({ok:true, source:'gateway-http',gatewayConnected:connected,
      gatewayUrl:GATEWAY_URL,lastId,lastPollAt,lastError,websocketClients:clients.size}));
    return;
  }
  res.writeHead(404, {'content-type':'application/json'});
  res.end('{"error":"Not found"}');
});
const wss = new WebSocketServer({server,path:'/ws/telemetry'});
wss.on('connection', socket => {
  clients.add(socket);
  send(socket, {kind:'bridge',mqttConnected:connected,source:'gateway-http'});
  send(socket, {kind:'telemetry',topic:`${TOPIC_BASE}/gateway/estado`,payload:connected?'online':'offline',receivedAt:Date.now()});
  socket.on('close',()=>clients.delete(socket));
  socket.on('error',()=>clients.delete(socket));
  // Reenviar estado de los sensores al conectarse una nueva pestaña.
  fetchJson('/api/ultimos').then(latest=>{
    if (!Array.isArray(latest)) return;
    for (const item of latest) if (item?.msg && item.hace_s >= 0 && NODE_TYPES.has(item.msg.tipo)) {
      const payload = item.msg.tipo === 'termico' ? {...item.msg,entradas:0,salidas:0} : item.msg;
      send(socket,{kind:'telemetry',topic:`${TOPIC_BASE}/${item.msg.tipo}`,payload,receivedAt:Date.now()});
    }
  }).catch(()=>{});
});
server.listen(PORT,'0.0.0.0',()=>{
  console.log(`[Bridge] Health: http://localhost:${PORT}/health`);
  console.log(`[Bridge] WebSocket: ws://localhost:${PORT}/ws/telemetry`);
  console.log(`[Bridge] Gateway: ${GATEWAY_URL}`);
  void poll();
});
const timer = setInterval(()=>void poll(), POLL_MS);
function stop(){clearInterval(timer);wss.close();server.close(()=>process.exit(0));}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
