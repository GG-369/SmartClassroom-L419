import {
  Users,
  LogIn,
  LogOut,
  ScanLine,
  Clock3,
  DoorOpen
} from "lucide-react";
import { THRESHOLDS } from "../data/sensorConfig";
import { formatClock } from "../utils/sensorStatus";

function Metric({ icon: Icon, label, value, unit = "" }) {
  return (
    <div className="occupancy-metric">
      <span className="metric-icon"><Icon size={17} /></span>
      <div>
        <span className="metric-label">{label}</span>
        <strong>{value ?? "—"} <small>{unit}</small></strong>
      </div>
    </div>
  );
}

export function OccupancyPanel({ data, sessionTotals, lastMovement }) {
  const occupancyValue = Number(data?.ocupacion_est);
  const hasOccupancy = data && Number.isFinite(occupancyValue);
  const occupancy = hasOccupancy ? Math.max(0, occupancyValue) : null;
  const capacity = THRESHOLDS.occupancy.designCapacity;
  const percent = occupancy === null ? 0 : Math.min(100, (occupancy / capacity) * 100);
  const overCapacity = occupancy !== null && occupancy > capacity;
  const atCapacity = occupancy !== null && occupancy >= capacity;

  return (
    <section className="panel-card occupancy-panel">
      <div className="panel-heading">
        <div>
          <span className="section-eyebrow">NODO 5 · MLX90640</span>
          <h2>Ocupación del aula</h2>
        </div>
        <span className="panel-heading-icon"><Users size={20} /></span>
      </div>

      <div className="occupancy-main">
        <div className="occupancy-number">
          <strong>{occupancy ?? "—"}</strong>
          <span>personas dentro</span>
        </div>
        <div className="occupancy-capacity">
          <div className="capacity-label">
            <span>Capacidad de diseño</span>
            <strong>{occupancy ?? "—"} / {capacity}</strong>
          </div>
          <div className="capacity-track">
            <div
              className={`capacity-fill ${overCapacity ? "over" : atCapacity ? "full" : ""}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className={`capacity-state ${overCapacity ? "critical" : atCapacity ? "warning" : ""}`}>
            {occupancy === null
              ? "Esperando conteo"
              : overCapacity
                ? "Por encima de la capacidad"
                : atCapacity
                  ? "Capacidad completa"
                  : "Dentro de la capacidad"}
          </span>
        </div>
      </div>

      <div className="occupancy-metrics-grid">
        <Metric icon={LogIn} label="Entradas desde conexión" value={sessionTotals.entries} unit="personas" />
        <Metric icon={LogOut} label="Salidas desde conexión" value={sessionTotals.exits} unit="personas" />
        <Metric icon={ScanLine} label="Máximo en vista (ventana)" value={data?.personas_en_vista} unit="personas" />
        <Metric icon={DoorOpen} label="Cruces dudosos (ventana)" value={data?.cruces_dudosos} unit="eventos" />
      </div>

      <div className="movement-strip">
        <Clock3 size={16} />
        {lastMovement ? (
          <span>
            Último reporte de movimiento: <strong>+{lastMovement.entries} entradas</strong> ·{" "}
            <strong>−{lastMovement.exits} salidas</strong> · {formatClock(lastMovement.receivedAt)}
          </span>
        ) : (
          <span>Aún no se ha recibido un paquete con entradas o salidas.</span>
        )}
      </div>

      <p className="method-note">
        El ESP32 procesa la matriz del MLX90640 localmente. Al Gateway solo envía conteos y métricas resumidas;
        esta interfaz no recibe ni dibuja los 768 píxeles térmicos.
      </p>
    </section>
  );
}
