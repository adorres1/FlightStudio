export const qualities = {
  compact: { crf: 25, vp9: 35, jpeg: .9 },
  standard: { crf: 20, vp9: 30, jpeg: .95 },
  high: { crf: 16, vp9: 24, jpeg: .98 },
};
export function exportSettings(options) {
  const { size = 1080, fps = 30, quality = "standard", acceleration = "auto" } = options;
  if (![720, 1080, 1440, 2160].includes(size)) throw new Error("Ungültige Auflösung.");
  if (![24, 25, 30, 50, 60].includes(fps)) throw new Error("Ungültige Bildrate.");
  if (!Object.hasOwn(qualities, quality)) throw new Error("Ungültige Exportqualität.");
  if (!["auto", "cpu"].includes(acceleration)) throw new Error("Ungültige Beschleunigung.");
  return { size, fps, quality, acceleration, audio: Boolean(options.audio), format: options.format };
}
export function pixelSize(aspect, short) {
  const [a, b] = aspect.split(":").map(Number), ratio = a / b;
  return { width: ratio >= 1 ? Math.round(short * ratio / 2) * 2 : short,
    height: ratio >= 1 ? short : Math.round(short / ratio / 2) * 2 };
}
