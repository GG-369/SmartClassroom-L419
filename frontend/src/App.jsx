import { useMemo } from "react";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { SensorGrid } from "./components/SensorGrid";
import { OccupancyPanel } from "./components/OccupancyPanel";
import { AlertsPanel } from "./components/AlertsPanel";
import { useTelemetry } from "./hooks/useTelemetry";
import { buildAlerts } from "./utils/alertRules";

export default function App() {
  const {
    bridgeStatus,
    mqttStatus,
    gatewayStatus,
    sensors,
    sessionTotals,
    lastMovement,
    now,
    onlineNodeCount
  } = useTelemetry();

  const alerts = useMemo(
    () => buildAlerts(sensors, gatewayStatus, now),
    [sensors, gatewayStatus, now]
  );

  return (
    <div className="app-layout">
      <Header
        bridgeStatus={bridgeStatus}
        mqttStatus={mqttStatus}
        gatewayStatus={gatewayStatus}
      />

      <main className="app-main">
        <Dashboard
          sensors={sensors}
          alerts={alerts}
          onlineNodeCount={onlineNodeCount}
          gatewayStatus={gatewayStatus}
          mqttStatus={mqttStatus}
          now={now}
        />

        <SensorGrid sensors={sensors} now={now} />

        <div className="lower-grid">
          <OccupancyPanel
            data={sensors.termico}
            sessionTotals={sessionTotals}
            lastMovement={lastMovement}
          />
          <AlertsPanel alerts={alerts} />
        </div>
      </main>

      <footer className="app-footer">
        Smart Classroom Digital Twin — Aula L-419 · ESP-NOW → Gateway ESP32 v4 → MQTT · EC3
      </footer>
    </div>
  );
}
