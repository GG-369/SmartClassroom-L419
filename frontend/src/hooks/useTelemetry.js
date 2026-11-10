import { useEffect, useMemo, useRef, useState } from "react";
import { SENSOR_CATALOG, THRESHOLDS } from "../data/sensorConfig";

const DEFAULT_WS_URL =
  import.meta.env.VITE_TELEMETRY_WS_URL ||
  `ws://${window.location.hostname}:3001/ws/telemetry`;

const EMPTY_TOTALS = { entries: 0, exits: 0 };

export function useTelemetry() {
  const [bridgeStatus, setBridgeStatus] = useState("connecting");
  const [mqttStatus, setMqttStatus] = useState("unknown");
  const [gatewayStatus, setGatewayStatus] = useState("unknown");
  const [sensors, setSensors] = useState({});
  const [sessionTotals, setSessionTotals] = useState(EMPTY_TOTALS);
  const [lastMovement, setLastMovement] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [lastGatewaySeen, setLastGatewaySeen] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    let active = true;
    let reconnectTimer = null;
    let socket = null;

    const connect = () => {
      if (!active) return;

      setBridgeStatus((current) =>
        current === "connected" ? "reconnecting" : "connecting"
      );

      try {
        socket = new WebSocket(DEFAULT_WS_URL);
        socketRef.current = socket;
      } catch {
        setBridgeStatus("error");
        reconnectTimer = window.setTimeout(connect, 2500);
        return;
      }

      socket.onopen = () => {
        if (active) setBridgeStatus("connected");
      };

      socket.onmessage = (event) => {
        if (!active) return;

        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.kind === "bridge") {
          setMqttStatus(message.mqttConnected ? "connected" : "disconnected");
          return;
        }

        if (message.kind !== "telemetry") return;

        const topicParts = String(message.topic || "").split("/");
        const topicType = topicParts[topicParts.length - 1];
        const payload = message.payload;
        const receivedAt = Number(message.receivedAt) || Date.now();

        if (
          topicParts[topicParts.length - 2] === "gateway" &&
          topicType === "estado"
        ) {
          const state =
            typeof payload === "string" ? payload : payload?.status;
          setGatewayStatus(state === "online" ? "online" : "offline");
          setLastGatewaySeen(receivedAt);
          return;
        }

        if (!SENSOR_CATALOG.some((sensor) => sensor.type === topicType)) return;
        if (!payload || typeof payload !== "object") return;

        setSensors((current) => ({
          ...current,
          [topicType]: {
            ...payload,
            receivedAt,
            topic: message.topic
          }
        }));

        if (topicType === "termico") {
          const entries = Math.max(0, Number(payload.entradas) || 0);
          const exits = Math.max(0, Number(payload.salidas) || 0);

          if (entries > 0 || exits > 0) {
            setLastMovement({ entries, exits, receivedAt });
          }

          setSessionTotals((current) => ({
            entries: current.entries + entries,
            exits: current.exits + exits
          }));
        }
      };

      socket.onerror = () => {
        if (active) setBridgeStatus("error");
      };

      socket.onclose = () => {
        if (!active) return;
        setBridgeStatus("disconnected");
        reconnectTimer = window.setTimeout(connect, 2500);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const onlineNodeCount = useMemo(
    () =>
      SENSOR_CATALOG.filter((sensor) => {
        const reading = sensors[sensor.type];
        return (
          reading &&
          now - reading.receivedAt <= THRESHOLDS.telemetry.staleAfterMs
        );
      }).length,
    [sensors, now]
  );

  return {
    bridgeStatus,
    mqttStatus,
    gatewayStatus,
    lastGatewaySeen,
    sensors,
    sessionTotals,
    lastMovement,
    now,
    onlineNodeCount
  };
}
