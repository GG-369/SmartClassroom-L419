import { SENSOR_CATALOG } from "../data/sensorConfig";
import { SensorCard } from "./SensorCard";

export function SensorGrid({ sensors, now }) {
  return (
    <section className="sensor-section">
      <div className="section-heading">
        <div>
          <span className="section-eyebrow">MONITOREO DEL AULA</span>
          <h2>Estado de los sensores</h2>
        </div>
        <p>Los valores y alertas se calculan a partir de los paquetes JSON publicados por el Gateway.</p>
      </div>

      <div className="sensor-grid">
        {SENSOR_CATALOG.map((sensor) => (
          <SensorCard
            key={sensor.type}
            type={sensor.type}
            data={sensors[sensor.type]}
            now={now}
          />
        ))}
      </div>
    </section>
  );
}
