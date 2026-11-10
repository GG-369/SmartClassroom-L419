# SmartClassroom-L419
## Smart Classroom Digital Twin — Aula L-419

Dashboard de monitorización de un aula inteligente mediante siete nodos IoT, Gateway ESP32 y comunicación MQTT.

## Arquitectura

Nodos IoT → Gateway ESP32 → Broker MQTT → Backend MQTT-WebSocket → Frontend React.

## Nodos IoT

| Nodo | Sensor | Función |
|---|---|---|
| 1 | MH-Z1911A | CO2 |
| 2 | INMP441 | Audio |
| 3 | MQ-2 | Gas y humo |
| 4 | BH1750 | Iluminación |
| 5 | MLX90640 | Ocupación |
| 6 | KY-024 Hall | Puerta |
| 7 | GY-BME280 | Ambiente |

## Estructura

- frontend/: Dashboard React + Vite.
- backend-mqtt-bridge/: Puente MQTT-WebSocket.
- firmware/: Firmware ESP32.
- docs/: Documentación técnica y contratos EC3.

## Requisitos

- Node.js
- Broker MQTT accesible.
- Gateway ESP32 configurado.

## Ejecución

### Backend

Desde backend-mqtt-bridge:

- npm install
- Copiar .env.example a .env
- Configurar MQTT_URL si corresponde.
- npm start

### Frontend

Desde frontend:

- npm install
- npm run dev

### Compilación

Desde frontend:

- npm run build

## Comunicación

- Health: http://localhost:3001/health
- WebSocket: ws://localhost:3001/ws/telemetry

## Documentación técnica

Consultar docs/EC3_DASHBOARD.md para:

- Contratos JSON y tópicos MQTT.
- Umbrales de alertas.
- Reglas de estados de sensores.
- Conteo de ocupación.
- Configuración del puente de comunicación.

## Pruebas

backend-mqtt-bridge/test-publisher.js permite simular publicaciones MQTT para comprobar el funcionamiento del dashboard.

## Seguridad

No subir archivos .env ni credenciales al repositorio. No exponer el broker MQTT ni el WebSocket directamente a Internet.
