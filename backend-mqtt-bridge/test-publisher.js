import mqtt from "mqtt";

const client = mqtt.connect("mqtt://127.0.0.1:1883");

const messages = [
  ["utec/gemelo/L419/gateway/estado", "online"],

  ["utec/gemelo/L419/nodo_1/co2", {
    co2_ppm: 650, delta_30s: 20, temp_c: 23,
    calentando: 0, nivel: 0, anomalias: 0
  }],

  ["utec/gemelo/L419/nodo_2/audio", {
    leq_db: 45.2, lmax_db: 58, pico_db: 62,
    base_db: 35, freq_dom_hz: 1000, tonal: 0.1,
    bloques_fuertes: 0, calibrando: 0, anomalias: 0
  }],

  ["utec/gemelo/L419/nodo_3/gas", {
    v_ao: 0.7, rs_r0: 1.2, do_alarma: 0,
    calentando: 0, anomalias: 0
  }],

  ["utec/gemelo/L419/nodo_4/luz", {
    lux: 500, lux_min: 450, lux_max: 550,
    lux_mesa_est: 350, luces_cambio: 0, anomalias: 0
  }],

  ["utec/gemelo/L419/nodo_5/termico", {
    entradas: 0, salidas: 0, ocupacion_est: 18,
    personas_en_vista: 3, cruces_dudosos: 0,
    t_fondo: 23, t_max: 31, calibrando: 0, anomalias: 0
  }],

  ["utec/gemelo/L419/nodo_6/magnetico", {
    puerta_abierta: 0, aperturas: 2,
    seg_abierta: 12, campo_raw: 300, anomalias: 0
  }],

  ["utec/gemelo/L419/nodo_7/ambiente", {
    temp_c: 23.5, hum_pct: 45,
    pres_hpa: 1013, anomalias: 0
  }]
];

async function publicar() {
  for (const [topic, payload] of messages) {
    await new Promise((resolve, reject) => {
      client.publish(
        topic,
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload),
        error => error ? reject(error) : resolve()
      );
    });
  }

  console.log("[TEST] Siete nodos actualizados:", new Date().toLocaleTimeString());
}

client.on("connect", async () => {
  console.log("[TEST] Simulación continua iniciada");

  await publicar();

  setInterval(() => {
    publicar().catch(console.error);
  }, 5000);
});

client.on("error", error => {
  console.error("[TEST] MQTT:", error.message);
});