import {
  Users,
  RadioTower,
  BellRing,
  Activity,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { SENSOR_CATALOG, THRESHOLDS } from "../data/sensorConfig";
import { isSensorFresh } from "../utils/sensorStatus";

function SummaryCard({ icon: Icon, title, value, unit, detail, tone = "blue" }) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <div className="summary-top">
        <span className="summary-label">{title}</span>
        <span className="summary-icon"><Icon size={19} /></span>
      </div>
      <div className="summary-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <p className="summary-detail">{detail}</p>
    </article>
  );
}

export function Dashboard({
  sensors,
  alerts,
  onlineNodeCount,
  gatewayStatus,
  mqttStatus,
  now
}) {
  const occupancy = sensors.termico?.ocupacion_est;
  const criticalCount = alerts.filter((alert) =>
    ["critical", "error"].includes(alert.severity)
  ).length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
  const gatewayOnline = gatewayStatus === "online" && mqttStatus === "connected";

  return (
    <section className="summary-grid">
      <SummaryCard
        icon={Users}
        title="Personas en el aula"
        value={Number.isFinite(Number(occupancy)) ? Math.max(0, Number(occupancy)) : "—"}
        unit="personas"
        detail={`Capacidad de diseño: ${THRESHOLDS.occupancy.designCapacity} personas`}
        tone="cyan"
      />
      <SummaryCard
        icon={RadioTower}
        title="Nodos con telemetría"
        value={onlineNodeCount}
        unit={`/ ${SENSOR_CATALOG.length}`}
        detail="Paquetes recibidos en los últimos 30 segundos"
        tone="blue"
      />
      <SummaryCard
        icon={BellRing}
        title="Alertas activas"
        value={alerts.length}
        unit=""
        detail={`${criticalCount} críticas / fallos · ${warningCount} advertencias`}
        tone={criticalCount > 0 ? "red" : warningCount > 0 ? "amber" : "green"}
      />
      <SummaryCard
        icon={gatewayOnline ? CheckCircle2 : gatewayStatus === "offline" ? AlertTriangle : Activity}
        title="Cadena de comunicación"
        value={gatewayOnline ? "En línea" : "Esperando"}
        unit=""
        detail={
          gatewayOnline
            ? "Gateway y broker MQTT disponibles"
            : "Se requiere Gateway → MQTT → puente web"
        }
        tone={gatewayOnline ? "green" : "amber"}
      />
    </section>
  );
}
