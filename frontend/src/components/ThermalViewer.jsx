import { useState, useRef, useEffect, useCallback } from "react";
import {
  Flame,
  Snowflake,
  Sliders,
  Camera,
  Maximize2,
  Crosshair,
  Sparkles,
  Palette
} from "lucide-react";
import { getRGB, getAvailablePalettes } from "../utils/colormap";
import { ColorScaleBar } from "./ColorScaleBar";

export function ThermalViewer({
  frame,
  minTempC,
  maxTempC,
  ambientTempC,
  minPoint,
  maxPoint
}) {
  const [palette, setPalette] = useState("ironbow");
  const [interpolated, setInterpolated] = useState(true);
  const [showExtremeMarkers, setShowExtremeMarkers] = useState(true);
  const [hoverInfo, setHoverInfo] = useState(null);

  const canvasRef = useRef(null);
  const offscreenCanvasRef = useRef(null);

  // Inicializar canvas offscreen de 32x24 para no alterar datos crudos
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      const offscreen = document.createElement("canvas");
      offscreen.width = 32;
      offscreen.height = 24;
      offscreenCanvasRef.current = offscreen;
    }
  }, []);

  // Renderizado en Canvas mediante ImageData
  useEffect(() => {
    const canvas = canvasRef.current;
    const offscreen = offscreenCanvasRef.current;
    if (!canvas || !offscreen) return;

    const ctx = canvas.getContext("2d");
    const offCtx = offscreen.getContext("2d");

    if (!frame || !Array.isArray(frame.pixels_dC) || frame.pixels_dC.length !== 768) {
      // Dibujar pantalla en reposo o esperando datos
      ctx.fillStyle = "#0c131d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#5a6b82";
      ctx.font = "14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Esperando fotogramas térmicos del MLX90640...", canvas.width / 2, canvas.height / 2);
      return;
    }

    const { pixels_dC, min_dC, max_dC } = frame;
    const range = Math.max(1, max_dC - min_dC);

    // 1. Dibujar píxeles en el buffer offscreen 32x24
    const imgData = offCtx.createImageData(32, 24);
    const data = imgData.data;

    for (let i = 0; i < 768; i++) {
      const val = pixels_dC[i];
      const ratio = (val - min_dC) / range;
      const [r, g, b] = getRGB(ratio, palette);
      const idx = i * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
    offCtx.putImageData(imgData, 0, 0);

    // 2. Dibujar escalado al canvas principal con interpolación visual GPU o píxeles directos
    ctx.imageSmoothingEnabled = interpolated;
    if (interpolated) {
      ctx.imageSmoothingQuality = "high";
    }
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  }, [frame, palette, interpolated]);

  // Manejo de hover con ratón para inspeccionar cada píxel
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !frame.pixels_dC) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const gridX = Math.min(31, Math.max(0, Math.floor((mouseX / canvas.width) * 32)));
    const gridY = Math.min(23, Math.max(0, Math.floor((mouseY / canvas.height) * 24)));

    const pixelIndex = gridY * 32 + gridX;
    const rawVal = frame.pixels_dC[pixelIndex];
    const tempC = rawVal !== undefined ? (rawVal / 10).toFixed(1) : "—";

    setHoverInfo({
      gridX,
      gridY,
      tempC,
      pixelX: ((gridX + 0.5) / 32) * 100,
      pixelY: ((gridY + 0.5) / 24) * 100
    });
  }, [frame]);

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  // Descarga de snapshot térmico
  const handleCaptureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `thermal_frame_${frame?.sequence || Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const palettes = getAvailablePalettes();

  return (
    <section className="thermal-viewer-card">
      <div className="viewer-header">
        <div className="viewer-title-group">
          <div className="viewer-eyebrow">MÓDULO B · ADQUISICIÓN ESP32</div>
          <h2 className="viewer-title">Mapa Térmico Infrarrojo MLX90640 (32 × 24)</h2>
          <p className="viewer-subtitle">
            Transmisión en tiempo real vía WebSocket. Resolución nativa de 768 zonas térmicas organizadas por filas.
          </p>
        </div>

        {/* Barra de Controles */}
        <div className="viewer-controls">
          {/* Selector de Paleta */}
          <div className="control-item">
            <Palette size={15} />
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="control-select"
              title="Escala cromática térmica"
            >
              {palettes.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Selector de Interpolación */}
          <button
            type="button"
            className={`btn-control-toggle ${interpolated ? "active" : ""}`}
            onClick={() => setInterpolated(!interpolated)}
            title="Activar/desactivar interpolación visual suave"
          >
            <Sparkles size={14} />
            <span>{interpolated ? "Suavizado ON" : "Píxeles Nativos"}</span>
          </button>

          {/* Toggle de Marcadores Mín/Máx */}
          <button
            type="button"
            className={`btn-control-toggle ${showExtremeMarkers ? "active" : ""}`}
            onClick={() => setShowExtremeMarkers(!showExtremeMarkers)}
            title="Mostrar/ocultar puntos de máxima y mínima temperatura"
          >
            <Crosshair size={14} />
            <span>Puntos Mín/Máx</span>
          </button>

          {/* Captura de Pantalla */}
          <button
            type="button"
            className="btn-control-icon"
            onClick={handleCaptureSnapshot}
            title="Guardar instantánea PNG del fotograma actual"
          >
            <Camera size={16} />
          </button>
        </div>
      </div>

      {/* Área del Canvas Térmico */}
      <div className="canvas-wrapper">
        <div className="canvas-container">
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className={`thermal-canvas ${interpolated ? "smoothed" : "pixelated"}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />

          {/* Marcadores de Máxima y Mínima Temperatura */}
          {showExtremeMarkers && frame && maxPoint && (
            <div
              className="thermal-marker marker-max"
              style={{
                left: `${((maxPoint.x + 0.5) / 32) * 100}%`,
                top: `${((maxPoint.y + 0.5) / 24) * 100}%`
              }}
              title={`Máximo térmico: ${maxPoint.tempC} °C en (${maxPoint.x}, ${maxPoint.y})`}
            >
              <div className="marker-dot" />
              <div className="marker-badge">
                <Flame size={11} /> {maxPoint.tempC} °C
              </div>
            </div>
          )}

          {showExtremeMarkers && frame && minPoint && (
            <div
              className="thermal-marker marker-min"
              style={{
                left: `${((minPoint.x + 0.5) / 32) * 100}%`,
                top: `${((minPoint.y + 0.5) / 24) * 100}%`
              }}
              title={`Mínimo térmico: ${minPoint.tempC} °C en (${minPoint.x}, ${minPoint.y})`}
            >
              <div className="marker-dot" />
              <div className="marker-badge">
                <Snowflake size={11} /> {minPoint.tempC} °C
              </div>
            </div>
          )}

          {/* Cursor de Inspección al pasar el ratón */}
          {hoverInfo && (
            <div
              className="hover-tooltip"
              style={{
                left: `${hoverInfo.pixelX}%`,
                top: `${hoverInfo.pixelY}%`
              }}
            >
              <div className="tooltip-coords">({hoverInfo.gridX}, {hoverInfo.gridY})</div>
              <div className="tooltip-temp">{hoverInfo.tempC} °C</div>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Escala Cromática Calibrada */}
      <div className="viewer-footer">
        <div className="scale-section">
          <span className="scale-title">Escala de temperatura:</span>
          <ColorScaleBar
            minTempC={minTempC}
            maxTempC={maxTempC}
            paletteName={palette}
          />
        </div>

        <div className="viewer-stats-strip">
          <div className="stat-pill">
            <span className="pill-label">Dispositivo:</span>
            <span className="pill-val">{frame?.device_id || "L419-ESP32"}</span>
          </div>
          <div className="stat-pill">
            <span className="pill-label">Matriz:</span>
            <span className="pill-val">32 × 24 (768 px)</span>
          </div>
          <div className="stat-pill">
            <span className="pill-label">Secuencia:</span>
            <span className="pill-val">#{frame?.sequence ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="viewer-notice">
        <strong>Nota metodológica:</strong> La interpolación visual se ejecuta en la GPU del cliente y no altera
        la estructura de 768 décimas de °C recibidas del sensor. Cada celda de inspección corresponde al valor real sin promediar.
      </div>
    </section>
  );
}
