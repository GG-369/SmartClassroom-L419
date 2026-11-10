import { useState, useEffect, useRef, useCallback } from "react";

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://10.100.101.227:8000";
const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || "ws://10.100.101.227:8000/ws/thermal";

// Generador sintético de prueba para modo DEMO
function generateSyntheticFrame(sequence, tick) {
  const width = 32;
  const height = 24;
  const t = tick * 0.25;

  // Fuentes térmicas simuladas (personas)
  const sources = [
    { x: 9 + 3.0 * Math.sin(t * 0.7), y: 8 + 2.0 * Math.cos(t * 0.5), amp: 7.5 },
    { x: 22 + 2.5 * Math.cos(t * 0.6), y: 13 + 2.0 * Math.sin(t * 0.8), amp: 8.0 },
    { x: 15 + 1.5 * Math.sin(t * 0.4), y: 18 + 1.2 * Math.cos(t * 0.4), amp: 6.8 }
  ];

  const ambientBase = 22.0 + 0.5 * Math.sin(t * 0.2);
  const pixels_dC = new Array(width * height);
  let min_dC = 9999;
  let max_dC = -9999;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let temp = ambientBase + 0.15 * Math.sin(x / 4) + 0.12 * Math.cos(y / 3);
      for (const s of sources) {
        const dx = x - s.x;
        const dy = y - s.y;
        const dist2 = (dx * dx) / 5.5 + (dy * dy) / 4.0;
        temp += s.amp * Math.exp(-dist2);
      }
      temp += (Math.random() - 0.5) * 0.25; // Ruido térmico natural
      const val_dC = Math.round(temp * 10);
      pixels_dC[y * width + x] = val_dC;
      if (val_dC < min_dC) min_dC = val_dC;
      if (val_dC > max_dC) max_dC = val_dC;
    }
  }

  return {
    type: "thermal_frame",
    schema_version: 1,
    device_id: "L419-ESP32-DEMO",
    sequence: sequence,
    width,
    height,
    ambient_dC: Math.round(ambientBase * 10),
    min_dC,
    max_dC,
    pixels_dC
  };
}

export function useThermalStream() {
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    return localStorage.getItem("sc_api_url") || DEFAULT_API_BASE_URL;
  });
  const [wsUrl, setWsUrl] = useState(() => {
    return localStorage.getItem("sc_ws_url") || DEFAULT_WS_URL;
  });

  const [mode, setMode] = useState("LIVE"); // "LIVE" | "DEMO"
  const [frame, setFrame] = useState(null);
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [wsStatus, setWsStatus] = useState("disconnected"); // "connecting" | "connected" | "disconnected" | "error"
  const [serialStatus, setSerialStatus] = useState({
    connected: false,
    port: "COM6",
    baud_rate: 460800,
    message: "Iniciando..."
  });
  const [serverOk, setServerOk] = useState(false);

  const timestampsRef = useRef([]);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const demoIntervalRef = useRef(null);
  const demoTickRef = useRef(0);
  const demoSeqRef = useRef(0);

  // Actualizar IP de forma dinámica desde la interfaz
  const updateServerIp = useCallback((ip) => {
    const cleanIp = ip.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:8000$/, "");
    const newApi = `http://${cleanIp}:8000`;
    const newWs = `ws://${cleanIp}:8000/ws/thermal`;
    localStorage.setItem("sc_api_url", newApi);
    localStorage.setItem("sc_ws_url", newWs);
    setApiBaseUrl(newApi);
    setWsUrl(newWs);
  }, []);

  // Registro para cálculo de FPS observado con ventana móvil
  const registerFrameArrival = useCallback(() => {
    const now = performance.now();
    const timestamps = timestampsRef.current;
    timestamps.push(now);

    while (timestamps.length > 0 && timestamps[0] < now - 4000) {
      timestamps.shift();
    }

    if (timestamps.length >= 2) {
      const deltaSec = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
      if (deltaSec > 0) {
        const measuredFps = (timestamps.length - 1) / deltaSec;
        setFps(Number(measuredFps.toFixed(1)));
      }
    }
    setFrameCount((prev) => prev + 1);
  }, []);

  // Procesa un fotograma válido del contrato v1.0
  const handleIncomingFrame = useCallback((frameData) => {
    if (!frameData || !Array.isArray(frameData.pixels_dC)) return;
    setFrame(frameData);
    registerFrameArrival();
  }, [registerFrameArrival]);

  // Consulta periódica de salud REST
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/health`);
      if (res.ok) {
        const data = await res.json();
        setServerOk(Boolean(data.ok));
        if (data.serial) {
          setSerialStatus({
            connected: Boolean(data.serial.connected),
            port: data.serial.port || "COM6",
            baud_rate: data.serial.baud_rate || 460800,
            message: data.serial.message || "OK"
          });
        }
      } else {
        setServerOk(false);
      }
    } catch {
      setServerOk(false);
    }
  }, [apiBaseUrl]);

  // Modo LIVE: Gestión de WebSocket
  useEffect(() => {
    if (mode !== "LIVE") return;

    let isMounted = true;
    checkHealth();
    const healthInterval = setInterval(checkHealth, 3000);

    const connectWebSocket = () => {
      if (!isMounted) return;
      setWsStatus("connecting");

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsStatus("connected");
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "thermal_frame" || data.pixels_dC) {
              handleIncomingFrame(data);
            } else if (data.frame && data.frame.pixels_dC) {
              handleIncomingFrame(data.frame);
            }
          } catch (err) {
            console.error("Error parseando frame WS:", err);
          }
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setWsStatus("error");
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsStatus("disconnected");
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted && mode === "LIVE") {
              connectWebSocket();
            }
          }, 2000);
        };
      } catch {
        setWsStatus("error");
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      clearInterval(healthInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [mode, wsUrl, checkHealth, handleIncomingFrame]);

  // Modo DEMO: Temporizador sintético (~2 FPS = 500 ms)
  useEffect(() => {
    if (mode !== "DEMO") return;

    setWsStatus("connected");
    setServerOk(true);
    setSerialStatus({
      connected: true,
      port: "VIRTUAL-SIM",
      baud_rate: 460800,
      message: "Generador de prueba activo (~2 FPS)"
    });

    demoIntervalRef.current = setInterval(() => {
      demoTickRef.current += 1;
      demoSeqRef.current += 1;
      const synthetic = generateSyntheticFrame(demoSeqRef.current, demoTickRef.current);
      handleIncomingFrame(synthetic);
    }, 500);

    return () => {
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
    };
  }, [mode, handleIncomingFrame]);

  // Cálculo de estadísticas y posiciones mín/máx
  let minPoint = null;
  let maxPoint = null;
  let ambientTempC = null;
  let minTempC = null;
  let maxTempC = null;

  if (frame && Array.isArray(frame.pixels_dC) && frame.pixels_dC.length === 768) {
    ambientTempC = frame.ambient_dC !== undefined ? (frame.ambient_dC / 10).toFixed(1) : "—";
    minTempC = frame.min_dC !== undefined ? (frame.min_dC / 10).toFixed(1) : "—";
    maxTempC = frame.max_dC !== undefined ? (frame.max_dC / 10).toFixed(1) : "—";

    let minVal = Infinity;
    let maxVal = -Infinity;
    let minIdx = 0;
    let maxIdx = 0;

    const pixels = frame.pixels_dC;
    for (let i = 0; i < pixels.length; i++) {
      const v = pixels[i];
      if (v < minVal) {
        minVal = v;
        minIdx = i;
      }
      if (v > maxVal) {
        maxVal = v;
        maxIdx = i;
      }
    }

    minPoint = {
      x: minIdx % 32,
      y: Math.floor(minIdx / 32),
      tempC: (minVal / 10).toFixed(1)
    };

    maxPoint = {
      x: maxIdx % 32,
      y: Math.floor(maxIdx / 32),
      tempC: (maxVal / 10).toFixed(1)
    };
  }

  return {
    mode,
    setMode,
    frame,
    fps,
    frameCount,
    wsStatus,
    serialStatus,
    serverOk,
    ambientTempC,
    minTempC,
    maxTempC,
    minPoint,
    maxPoint,
    apiBaseUrl,
    wsUrl,
    updateServerIp
  };
}
