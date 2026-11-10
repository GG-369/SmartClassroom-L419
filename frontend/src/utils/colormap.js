/**
 * Utilidades para mapeo de escalas cromáticas térmicas.
 * Se incluyen las paletas Ironbow (FLIR estándar), Inferno (perceptualmente uniforme)
 * y Jet / Rainbow clásica.
 */

// Puntos de anclaje [pos (0..1), r, g, b]
const PALETTES = {
  ironbow: [
    [0.0, 10, 8, 30],
    [0.15, 45, 15, 95],
    [0.3, 115, 20, 140],
    [0.45, 190, 40, 90],
    [0.6, 230, 80, 30],
    [0.75, 245, 150, 15],
    [0.9, 255, 220, 80],
    [1.0, 255, 255, 240]
  ],
  inferno: [
    [0.0, 0, 0, 4],
    [0.2, 40, 11, 84],
    [0.4, 101, 21, 110],
    [0.6, 186, 54, 85],
    [0.8, 249, 140, 10],
    [1.0, 252, 255, 164]
  ],
  rainbow: [
    [0.0, 0, 0, 180],
    [0.2, 0, 160, 255],
    [0.4, 0, 220, 120],
    [0.6, 220, 230, 0],
    [0.8, 255, 120, 0],
    [1.0, 240, 0, 0]
  ]
};

/**
 * Obtiene el color [r, g, b] interpolado linealmente para un ratio en [0, 1].
 */
export function getRGB(ratio, paletteName = "ironbow") {
  const palette = PALETTES[paletteName] || PALETTES.ironbow;
  const clamped = Math.max(0, Math.min(1, ratio));

  // Buscar segmento
  for (let i = 0; i < palette.length - 1; i++) {
    const [p0, r0, g0, b0] = palette[i];
    const [p1, r1, g1, b1] = palette[i + 1];

    if (clamped >= p0 && clamped <= p1) {
      const t = (clamped - p0) / (p1 - p0);
      return [
        Math.round(r0 + (r1 - r0) * t),
        Math.round(g0 + (g1 - g0) * t),
        Math.round(b0 + (b1 - b0) * t)
      ];
    }
  }

  const last = palette[palette.length - 1];
  return [last[1], last[2], last[3]];
}

/**
 * Retorna string CSS 'rgb(r, g, b)'
 */
export function getRGBString(ratio, paletteName = "ironbow") {
  const [r, g, b] = getRGB(ratio, paletteName);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Devuelve la lista de paletas disponibles.
 */
export function getAvailablePalettes() {
  return [
    { id: "ironbow", name: "Ironbow (FLIR)" },
    { id: "inferno", name: "Inferno (Uniforme)" },
    { id: "rainbow", name: "Rainbow / Jet" }
  ];
}
