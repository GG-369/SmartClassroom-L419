import {
  Bell,
  AlertTriangle,
  CircleAlert,
  Info,
  CheckCircle2
} from "lucide-react";

const SEVERITY_META = {
  critical: { label: "Crítica", icon: AlertTriangle },
  error: { label: "Fallo", icon: CircleAlert },
  warning: { label: "Advertencia", icon: AlertTriangle },
  info: { label: "Información", icon: Info }
};

export function AlertsPanel({ alerts }) {
  return (
    <section className="panel-card alerts-panel">
      <div className="panel-heading">
        <div>
          <span className="section-eyebrow">ASISTENCIA A OPERACIONES</span>
          <h2>Alertas y recomendaciones</h2>
        </div>
        <span className="panel-heading-icon"><Bell size={20} /></span>
      </div>

      {alerts.length === 0 ? (
        <div className="alerts-empty">
          <CheckCircle2 size={24} />
          <strong>No hay alertas activas</strong>
          <p>
            Cuando un sensor supere su umbral o reporte una anomalía, aparecerá aquí con una posible causa
            y una acción recomendada. Sin telemetría no se puede afirmar que el aula esté en estado normal.
          </p>
        </div>
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => {
            const meta = SEVERITY_META[alert.severity] || SEVERITY_META.info;
            const Icon = meta.icon;
            return (
              <article className={`alert-item severity-${alert.severity}`} key={alert.id}>
                <span className="alert-icon"><Icon size={18} /></span>
                <div className="alert-content">
                  <div className="alert-title-row">
                    <strong>{alert.title}</strong>
                    <span>{meta.label}</span>
                  </div>
                  <p>{alert.description}</p>
                  <div className="alert-recommendation">
                    <b>Acción sugerida:</b> {alert.recommendation}
                  </div>
                  <small>{alert.sensor}</small>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
