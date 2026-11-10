import {
  Wind,
  Volume2,
  Flame,
  Sun,
  Users,
  DoorOpen,
  Thermometer,
  Clock3,
  Activity
} from "lucide-react";
import { SENSOR_BY_TYPE } from "../data/sensorConfig";
import { formatAge, getSensorStatus } from "../utils/sensorStatus";

const ICONS = {
  co2: Wind,
  audio: Volume2,
  gas: Flame,
  luz: Sun,
  termico: Users,
  magnetico: DoorOpen,
  ambiente: Thermometer
};

function numberOrDash(value, decimals = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : "—";
}

function getReading(type, data) {
  if (!data) return { value: "—", unit: "", detail: "Aún no se reciben mediciones." };

  switch (type) {
    case "co2":
      return {
        value: Number(data.co2_ppm) >= 0 ? Math.round(Number(data.co2_ppm)).toLocaleString("es-PE") : "—",
        unit: "ppm",
        detail: `Estado informado por el nodo: ${data.nivel || "—"} · Variación 30 s: ${data.delta_30s ?? "—"} ppm`
      };
    case "audio":
      return {
        value: numberOrDash(data.leq_db),
        unit: "dB",
        detail: `Máximo: ${numberOrDash(data.lmax_db)} dB · Pico: ${numberOrDash(data.pico_db)} dB`
      };
    case "gas":
      return {
        value: Number(data.do_alarma) === 1 ? "DETECTADO" : "Sin alarma",
        unit: "",
        detail: `Rs/R0: ${numberOrDash(data.rs_r0, 3)} · Salida analógica: ${numberOrDash(data.v_ao, 2)} V`
      };
    case "luz":
      return {
        value: numberOrDash(data.lux_mesa_est),
        unit: "lux",
        detail: `Estimación sobre mesa · Sensor en techo: ${numberOrDash(data.lux)} lux`
      };
    case "termico":
      return {
        value: Number.isFinite(Number(data.ocupacion_est)) ? Math.max(0, Number(data.ocupacion_est)) : "—",
        unit: "personas",
        detail: `Último paquete: +${Number(data.entradas) || 0} entradas · −${Number(data.salidas) || 0} salidas`
      };
    case "magnetico":
      return {
        value: Number(data.puerta_abierta) === 1 ? "Abierta" : "Cerrada",
        unit: "",
        detail: `${Number(data.aperturas) || 0} aperturas en el último intervalo · ${numberOrDash(data.seg_abierta)} s abierta`
      };
    case "ambiente":
      return {
        value: numberOrDash(data.temp_c),
        unit: "°C",
        detail: `${numberOrDash(data.hum_pct)} % HR · ${numberOrDash(data.pres_hpa)} hPa`
      };
    default:
      return { value: "—", unit: "", detail: "" };
  }
}

export function SensorCard({ type, data, now }) {
  const config = SENSOR_BY_TYPE[type];
  const Icon = ICONS[type] || Activity;
  const status = getSensorStatus(type, data, now);
  const reading = getReading(type, data);

  return (
    <article className={`sensor-card level-${status.level}`}>
      <div className="sensor-card-header">
        <div className="sensor-identity">
          <span className="sensor-icon"><Icon size={20} /></span>
          <div>
            <h3>{config.shortName}</h3>
            <p>{config.model} · Nodo {config.nodeId}</p>
          </div>
        </div>
        <span className={`status-pill ${status.level}`}>{status.label}</span>
      </div>

      <div className="sensor-reading">
        <strong>{reading.value}</strong>
        {reading.unit && <span>{reading.unit}</span>}
      </div>

      <p className="sensor-description">{config.description}</p>
      <p className="sensor-detail">{reading.detail}</p>

      {type === "gas" && !data && (
        <p className="sensor-pending-note">
          El protocolo del Gateway contempla MQ-2, pero el ZIP recibido no incluye nodo_gas.ino.
        </p>
      )}

      <div className="sensor-card-footer">
        <span>{status.description}</span>
        <span className="last-seen">
          <Clock3 size={12} />
          {data ? formatAge(data.receivedAt, now) : "Sin registro"}
        </span>
      </div>
    </article>
  );
}
