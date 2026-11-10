import { SENSOR_BY_TYPE, THRESHOLDS } from "../data/sensorConfig";

function getFlags(data) {
  return String(data?.anomalias || "")
    .split("|")
    .filter(Boolean);
}

export function getSensorStatus(type, data, now) {
  const config = SENSOR_BY_TYPE[type];

  if (!data) {
    if (config?.firmwareIncluded === false) {
      return {
        level: "pending",
        label: "Pendiente",
        description: "El Gateway define el paquete, pero falta el firmware del nodo en el ZIP."
      };
    }

    return {
      level: "waiting",
      label: "Sin datos",
      description: "Esperando el primer paquete de este nodo."
    };
  }

  if (now - data.receivedAt > THRESHOLDS.telemetry.staleAfterMs) {
    return {
      level: "offline",
      label: "Sin comunicación",
      description: "No se reciben paquetes recientes de este nodo."
    };
  }

  const flags = getFlags(data);
  const hasFault = flags.includes("FALLO_SENSOR") || flags.includes("FALLO_AUDIO");

  if (hasFault) {
    return {
      level: "error",
      label: "Fallo",
      description: "El propio nodo reportó un fallo de sensor o adquisición."
    };
  }

  if (type === "co2") {
    if (Number(data.calentando) === 1 || data.nivel === "CALENTANDO") {
      return {
        level: "calibrating",
        label: "Calentando",
        description: "El nodo está en su periodo inicial de calentamiento."
      };
    }

    const ppm = Number(data.co2_ppm);
    if (!Number.isFinite(ppm) || ppm < 0 || data.nivel === "SIN_DATO") {
      return {
        level: "error",
        label: "Sin lectura válida",
        description: "El nodo no está entregando una concentración válida."
      };
    }
    if (ppm >= THRESHOLDS.co2.criticalAt || flags.includes("CO2_CRITICO")) {
      return {
        level: "critical",
        label: "Crítico",
        description: "La concentración requiere ventilación inmediata."
      };
    }
    if (
      ppm >= THRESHOLDS.co2.normalBelow ||
      flags.includes("CO2_ALERTA_VENTILACION") ||
      flags.includes("CO2_PICO_RAPIDO")
    ) {
      return {
        level: "warning",
        label: "Elevado",
        description: "Conviene renovar el aire y revisar la ventilación."
      };
    }
  }

  if (type === "audio") {
    if (Number(data.calibrando) === 1) {
      return {
        level: "calibrating",
        label: "Calibrando",
        description: "El nodo está aprendiendo el ruido de fondo."
      };
    }
    if (
      flags.includes("RUIDO_IMPACTO") ||
      flags.includes("RUIDO_FUERTE_SOSTENIDO") ||
      flags.includes("RUIDO_MECANICO_CONSTANTE")
    ) {
      return {
        level: "warning",
        label: "Evento acústico",
        description: "El algoritmo detectó ruido anómalo."
      };
    }
  }

  if (type === "gas") {
    if (Number(data.calentando) === 1) {
      return {
        level: "calibrating",
        label: "Calentando",
        description: "El detector todavía no está listo para evaluar."
      };
    }
    if (Number(data.do_alarma) === 1 || flags.includes("GAS_DETECTADO")) {
      return {
        level: "critical",
        label: "Alarma de gas / humo",
        description: "El detector reportó presencia de gas o humo."
      };
    }
  }

  if (type === "luz") {
    if (
      flags.includes("ILUMINACION_BAJA") ||
      Number(data.lux_mesa_est) < THRESHOLDS.light.lowTableLux
    ) {
      return {
        level: "warning",
        label: "Iluminación baja",
        description: "La estimación de iluminancia sobre la mesa está bajo 300 lux."
      };
    }
  }

  if (type === "termico") {
    if (Number(data.calibrando) === 1) {
      return {
        level: "calibrating",
        label: "Calibrando",
        description: "Mantener despejada la puerta mientras aprende el fondo."
      };
    }
    if (
      Number(data.cruces_dudosos) > 0 ||
      flags.includes("OBJETO_ESTATICO")
    ) {
      return {
        level: "warning",
        label: "Conteo a verificar",
        description: "Hay cruces dudosos u objetos estáticos en la zona de conteo."
      };
    }
  }

  if (type === "magnetico") {
    if (flags.includes("PUERTA_ABIERTA_PROLONGADA")) {
      return {
        level: "warning",
        label: "Abierta demasiado tiempo",
        description: "La puerta lleva abierta más de 10 minutos."
      };
    }
    if (Number(data.puerta_abierta) === 1) {
      return {
        level: "info",
        label: "Puerta abierta",
        description: "El sensor Hall confirma que la puerta está abierta."
      };
    }
  }

  if (type === "ambiente") {
    const temp = Number(data.temp_c);
    const humidity = Number(data.hum_pct);
    if (
      flags.includes("TEMP_FUERA_CONFORT") ||
      (Number.isFinite(temp) &&
        (temp < THRESHOLDS.environment.temperatureMin ||
          temp > THRESHOLDS.environment.temperatureMax)) ||
      flags.includes("HUMEDAD_ALTA") ||
      (Number.isFinite(humidity) &&
        humidity > THRESHOLDS.environment.humidityHigh) ||
      flags.includes("CAMBIO_RAPIDO_TEMP")
    ) {
      return {
        level: "warning",
        label: "Fuera de confort",
        description: "Temperatura o humedad fuera del rango definido por el nodo."
      };
    }
  }

  return {
    level: "normal",
    label: type === "magnetico" ? "Puerta cerrada" : "Normal",
    description: "Última lectura recibida sin anomalías activas."
  };
}

export function isSensorFresh(data, now) {
  return Boolean(
    data && now - data.receivedAt <= THRESHOLDS.telemetry.staleAfterMs
  );
}

export function formatAge(timestamp, now = Date.now()) {
  if (!timestamp) return "Sin registro";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 2) return "Ahora";
  if (seconds < 60) return `Hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  return `Hace ${Math.floor(minutes / 60)} h`;
}

export function formatClock(timestamp) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
