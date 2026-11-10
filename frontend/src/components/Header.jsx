import { Activity, Radio, Server } from "lucide-react";

export function Header({ bridgeStatus, mqttStatus, gatewayStatus }) {
  const connectionLabel =
    bridgeStatus !== "connected"
      ? "Puente MQTT desconectado"
      : mqttStatus === "connected"
        ? "MQTT conectado"
        : "Broker MQTT sin conexión";

  const connectionLevel =
    bridgeStatus === "connected" && mqttStatus === "connected"
      ? "online"
      : bridgeStatus === "connected"
        ? "warning"
        : "offline";

  const gatewayLabel =
    gatewayStatus === "online"
      ? "Gateway en línea"
      : gatewayStatus === "offline"
        ? "Gateway desconectado"
        : "Gateway esperando";

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-logo">
          <Activity size={23} />
        </div>
        <div>
          <div className="brand-title">Smart Classroom Digital Twin</div>
          <div className="brand-subtitle">
            Aula L-419 · 7 nodos IoT · Gateway ESP32 v4
          </div>
        </div>
      </div>

      <div className="header-status">
        <span className={`connection-pill ${connectionLevel}`}>
          <Radio size={14} />
          {connectionLabel}
        </span>
        <span className={`connection-pill ${gatewayStatus}`}>
          <Server size={14} />
          {gatewayLabel}
        </span>
      </div>
    </header>
  );
}
