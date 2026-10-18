import { sampleFlight } from "./flight.mjs";
export function flightReadouts(primary, overlays, sourceTime) {
  if (!primary) return [];
  return [{ id: "main", name: primary.pilot || primary.name, color: "#f28143", sample: sampleFlight(primary, sourceTime) },
    ...(overlays || []).filter((o) => o.visible !== false).map((o) => ({
      id: o.id, name: o.name || o.flight.name, color: o.color,
      sample: sampleFlight(o.flight, overlayTime(o, primary, sourceTime)),
    }))];
}
export function readoutRect(clip, count) {
  return clip.statsRect || { x: .012, y: .016, w: .46, h: Math.min(.85, (34 + Math.max(1, count) * 32) / 720) };
}
export const flightColors = [
  "#2db7f5",
  "#bd76f5",
  "#30c994",
  "#ff5f84",
  "#e5c744",
  "#fafafa",
];
export function overlayTime(overlay, primary, sourceTime) {
  const shift = Number(overlay.offsetSeconds) || 0;
  return (
    (overlay.alignment === "start"
      ? overlay.flight.start + sourceTime - primary.start
      : sourceTime) -
    shift * 1000
  );
}
export function makeOverlay(flight, index, id = crypto.randomUUID()) {
  return {
    id,
    flight,
    name: flight.pilot || flight.name,
    color: flightColors[index % flightColors.length],
    visible: true,
    alignment: "absolute",
    offsetSeconds: 0,
  };
}
