export const SENSOR_CATALOG = [
  {
    id: "co2",
    type: "co2",
    nodeId: 1,
    name: "Dióxido de carbono",
    shortName: "CO₂",
    model: "MH-Z1911A",
    unit: "ppm",
    firmwareIncluded: true,
    description: "Calidad del aire y ventilación"
  },
  {
    id: "audio",
    type: "audio",
    nodeId: 2,
    name: "Ruido ambiental",
    shortName: "Audio",
    model: "INMP441",
    unit: "dB",
    firmwareIncluded: true,
    description: "Ruido fuerte, impactos y ruido mecánico"
  },
  {
    id: "gas",
    type: "gas",
    nodeId: 3,
    name: "Gas / humo",
    shortName: "Gas / humo",
    model: "MQ-2",
    unit: "",
    firmwareIncluded: false,
    description: "Detección de gas o humo"
  },
  {
    id: "light",
    type: "luz",
    nodeId: 4,
    name: "Iluminación",
    shortName: "Luz",
    model: "BH1750",
    unit: "lux",
    firmwareIncluded: true,
    description: "Iluminancia estimada sobre la mesa"
  },
  {
    id: "thermal",
    type: "termico",
    nodeId: 5,
    name: "Conteo de personas",
    shortName: "Ocupación",
    model: "MLX90640",
    unit: "personas",
    firmwareIncluded: true,
    description: "Conteo local; no transmite la matriz térmica"
  },
  {
    id: "magnetic",
    type: "magnetico",
    nodeId: 6,
    name: "Estado de la puerta",
    shortName: "Puerta",
    model: "KY-024 Hall",
    unit: "",
    firmwareIncluded: true,
    description: "Apertura, cierre y tiempo abierta"
  },
  {
    id: "environment",
    type: "ambiente",
    nodeId: 7,
    name: "Condiciones ambientales",
    shortName: "Ambiente",
    model: "GY-BME280",
    unit: "°C",
    firmwareIncluded: true,
    description: "Temperatura, humedad y presión"
  }
];

export const SENSOR_BY_TYPE = Object.fromEntries(
  SENSOR_CATALOG.map((sensor) => [sensor.type, sensor])
);

export const THRESHOLDS = {
  co2: {
    normalBelow: 800,
    criticalAt: 1500,
    unit: "ppm",
    source: "Gaphor EC3: 800 ppm; firmware del nodo: 1500 ppm crítico"
  },
  environment: {
    temperatureMin: 20,
    temperatureMax: 26,
    humidityHigh: 70,
    rapidTemperatureChange: 1.5,
    rapidTemperatureWindowMinutes: 5
  },
  light: {
    lowTableLux: 300,
    hysteresisLux: 30
  },
  door: {
    prolongedOpenSeconds: 600
  },
  occupancy: {
    designCapacity: 30
  },
  telemetry: {
    staleAfterMs: 30000
  }
};
