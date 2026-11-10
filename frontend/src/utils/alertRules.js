import { THRESHOLDS } from "../data/sensorConfig";

function flagsOf(data) {
  return String(data?.anomalias || "")
    .split("|")
    .filter(Boolean);
}

export function buildAlerts(sensors, gatewayStatus, now) {
  const alerts = [];

  const add = (id, severity, sensor, title, description, recommendation) => {
    alerts.push({
      id,
      severity,
      sensor,
      title,
      description,
      recommendation
    });
  };

  if (gatewayStatus === "offline") {
    add(
      "gateway-offline",
      "critical",
      "Gateway",
      "Gateway desconectado",
      "El gateway publicó el estado offline.",
      "Revisar alimentación del ESP32 gateway y su conexión Wi-Fi."
    );
  }

  for (const [type, data] of Object.entries(sensors)) {
    if (!data) continue;

    if (now - data.receivedAt > THRESHOLDS.telemetry.staleAfterMs) {
      add(
        `${type}-stale`,
        "warning",
        type,
        "Sin telemetría reciente",
        "No se recibió un paquete de este nodo durante más de 30 segundos.",
        "Verificar alimentación, enlace ESP-NOW y recepción en el gateway."
      );
      continue;
    }

    const flags = flagsOf(data);

    if (type === "co2") {
      if (Number(data.calentando) === 1 || data.nivel === "CALENTANDO") continue;
      const ppm = Number(data.co2_ppm);
      if (flags.includes("FALLO_SENSOR") || !Number.isFinite(ppm) || ppm < 0) {
        add(
          "co2-fault",
          "error",
          "CO₂",
          "No hay una lectura válida de CO₂",
          "El nodo reporta fallo o un valor inválido.",
          "Revisar el MH-Z1911A, su alimentación y la comunicación UART."
        );
      } else if (ppm >= THRESHOLDS.co2.criticalAt || flags.includes("CO2_CRITICO")) {
        add(
          "co2-critical",
          "critical",
          "CO₂",
          `CO₂ crítico: ${Math.round(ppm)} ppm`,
          "La concentración está en el rango crítico definido para el sistema.",
          "Ventilar el aula inmediatamente y comprobar el sistema de renovación de aire."
        );
      } else if (ppm >= THRESHOLDS.co2.normalBelow) {
        add(
          "co2-high",
          "warning",
          "CO₂",
          `CO₂ por encima de 800 ppm: ${Math.round(ppm)} ppm`,
          "Se superó el umbral normal adoptado para la EC3.",
          "Abrir puertas o ventanas y revisar la ventilación del aula."
        );
      }

      if (flags.includes("CO2_PICO_RAPIDO")) {
        add(
          "co2-rapid-rise",
          "warning",
          "CO₂",
          "Aumento rápido de CO₂",
          "El nodo detectó un incremento brusco durante su ventana de análisis.",
          "Revisar si aumentó la ocupación o disminuyó la ventilación."
        );
      }
    }

    if (type === "audio") {
      if (flags.includes("FALLO_AUDIO")) {
        add(
          "audio-fault",
          "error",
          "Audio",
          "Fallo en el nodo de audio",
          "El nodo dejó de recibir muestras válidas del micrófono.",
          "Revisar el INMP441, el cableado I2S y la alimentación."
        );
      }
      if (flags.includes("RUIDO_IMPACTO")) {
        add(
          "audio-impact",
          "warning",
          "Audio",
          "Impacto acústico detectado",
          "El algoritmo detectó un evento sonoro impulsivo.",
          "Comprobar si hubo un golpe, caída de objeto u otro ruido puntual."
        );
      }
      if (flags.includes("RUIDO_FUERTE_SOSTENIDO")) {
        add(
          "audio-sustained",
          "warning",
          "Audio",
          "Ruido fuerte sostenido",
          "Se detectó ruido elevado durante varios bloques de análisis.",
          "Revisar el nivel de ruido y las actividades que se desarrollan en el aula."
        );
      }
      if (flags.includes("RUIDO_MECANICO_CONSTANTE")) {
        add(
          "audio-mechanical",
          "warning",
          "Audio",
          "Ruido mecánico persistente",
          "Se detectó una componente tonal persistente.",
          "Revisar ventiladores, proyectores u otros equipos del aula."
        );
      }
    }

    if (type === "gas") {
      if (flags.includes("FALLO_SENSOR")) {
        add(
          "gas-fault",
          "error",
          "Gas / humo",
          "Fallo en el detector de gas / humo",
          "El nodo reportó un fallo de sensor.",
          "Revisar el detector y su conexión con el nodo."
        );
      } else if (Number(data.do_alarma) === 1 || flags.includes("GAS_DETECTADO")) {
        add(
          "gas-detected",
          "critical",
          "Gas / humo",
          "Alarma de gas / humo",
          "El detector reportó presencia de gas o humo.",
          "Verificar el ambiente y seguir el protocolo de seguridad del aula."
        );
      }
    }

    if (type === "luz") {
      if (flags.includes("FALLO_SENSOR")) {
        add(
          "light-fault",
          "error",
          "Iluminación",
          "Fallo en el sensor de luz",
          "El nodo BH1750 reportó una lectura inválida.",
          "Revisar alimentación, dirección I²C y cableado del BH1750."
        );
      } else if (
        flags.includes("ILUMINACION_BAJA") ||
        Number(data.lux_mesa_est) < THRESHOLDS.light.lowTableLux
      ) {
        add(
          "light-low",
          "warning",
          "Iluminación",
          "Iluminación baja sobre la mesa",
          `La estimación es ${Number(data.lux_mesa_est).toFixed(1)} lux; el umbral es 300 lux.`,
          "Encender o ajustar las luminarias y volver a comprobar la iluminación."
        );
      }
    }

    if (type === "termico") {
      if (flags.includes("FALLO_SENSOR")) {
        add(
          "thermal-fault",
          "error",
          "Conteo de personas",
          "Fallo en el nodo térmico",
          "El nodo MLX90640 reportó un fallo.",
          "Revisar el sensor, el bus I²C y el montaje sobre la puerta."
        );
      }
      if (Number(data.cruces_dudosos) > 0) {
        add(
          "thermal-uncertain-crossings",
          "warning",
          "Conteo de personas",
          "Cruces de baja confianza",
          `El último paquete contiene ${data.cruces_dudosos} cruces dudosos.`,
          "Verificar la zona de paso y evitar obstrucciones en la puerta."
        );
      }
      if (flags.includes("OBJETO_ESTATICO")) {
        add(
          "thermal-static-object",
          "info",
          "Conteo de personas",
          "Objeto caliente estático detectado",
          "El algoritmo identificó una región caliente que no parece corresponder a un cruce.",
          "Comprobar que no haya objetos calientes obstruyendo la zona de detección."
        );
      }
    }

    if (type === "magnetico") {
      if (flags.includes("FALLO_SENSOR")) {
        add(
          "door-fault",
          "error",
          "Puerta",
          "Fallo en el sensor magnético",
          "El nodo KY-024 reportó una señal anómala.",
          "Revisar el sensor Hall, el imán y el cableado analógico."
        );
      }
      if (flags.includes("PUERTA_ABIERTA_PROLONGADA")) {
        add(
          "door-open-too-long",
          "warning",
          "Puerta",
          "Puerta abierta durante más de 10 minutos",
          "El nodo detectó una apertura prolongada.",
          "Comprobar si la puerta quedó abierta y si afecta la ventilación o seguridad."
        );
      }
    }

    if (type === "ambiente") {
      if (flags.includes("FALLO_SENSOR")) {
        add(
          "environment-fault",
          "error",
          "Ambiente",
          "Fallo en el sensor ambiental",
          "El nodo BME280 reportó lecturas inválidas.",
          "Revisar alimentación, cableado I²C y dirección del BME280."
        );
      }
      if (flags.includes("TEMP_FUERA_CONFORT")) {
        add(
          "temperature-outside-comfort",
          "warning",
          "Ambiente",
          "Temperatura fuera del rango de confort",
          `El rango configurado en el nodo es ${THRESHOLDS.environment.temperatureMin}–${THRESHOLDS.environment.temperatureMax} °C.`,
          "Revisar climatización y condiciones térmicas del aula."
        );
      }
      if (flags.includes("HUMEDAD_ALTA")) {
        add(
          "humidity-high",
          "warning",
          "Ambiente",
          "Humedad relativa elevada",
          `La humedad supera ${THRESHOLDS.environment.humidityHigh} %.`,
          "Revisar ventilación y posibles fuentes de humedad."
        );
      }
      if (flags.includes("CAMBIO_RAPIDO_TEMP")) {
        add(
          "temperature-rapid-change",
          "warning",
          "Ambiente",
          "Cambio rápido de temperatura",
          "El nodo detectó una variación superior a 1.5 °C en una ventana de 5 minutos.",
          "Comprobar cambios bruscos de climatización, puertas abiertas o fuentes de calor."
        );
      }
    }
  }

  const order = { critical: 0, error: 1, warning: 2, info: 3 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
