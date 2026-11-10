import { useEffect, useRef } from "react";
import { getRGB } from "../utils/colormap";

export function ColorScaleBar({ minTempC, maxTempC, paletteName = "ironbow" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let x = 0; x < width; x++) {
      const ratio = x / (width - 1);
      const [r, g, b] = getRGB(ratio, paletteName);
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [paletteName]);

  const minVal = minTempC !== null && minTempC !== undefined ? `${minTempC} °C` : "—";
  const maxVal = maxTempC !== null && maxTempC !== undefined ? `${maxTempC} °C` : "—";
  let midVal = "—";
  if (minTempC !== null && maxTempC !== null && !isNaN(minTempC) && !isNaN(maxTempC)) {
    midVal = `${((Number(minTempC) + Number(maxTempC)) / 2).toFixed(1)} °C`;
  }

  return (
    <div className="color-scale-container">
      <div className="scale-bar-wrapper">
        <canvas ref={canvasRef} width={280} height={14} className="scale-bar-canvas" />
      </div>
      <div className="scale-labels">
        <span className="scale-label min">{minVal}</span>
        <span className="scale-label mid">{midVal}</span>
        <span className="scale-label max">{maxVal}</span>
      </div>
    </div>
  );
}
