import { fade } from "/lib/timeline.mjs";
import { readoutRect } from "/lib/flight-overlays.mjs";
import { translate as t } from "./i18n.mjs";
export function drawFrame(
  ctx,
  { state, layers, elements, map, rects, time, flightClip, language = "de" },
) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  ctx.globalAlpha = 1;
  ctx.fillStyle = state.background || "#17252a";
  ctx.fillRect(0, 0, w, h);
  for (const c of layers) {
    const r = rects.get(c.id);
    if (!r) continue;
    const x = r.x * w,
      y = r.y * h,
      rw = r.w * w,
      rh = r.h * h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, rw, rh);
    ctx.clip();
    ctx.globalAlpha = (c.opacity ?? 1) * fade(c, time);
    if (c.kind === "flight") {
      ctx.drawImage(map.canvas, x, y, rw, rh);
      if (c.showStats === false && map.legend.length > 1) {
        const k = Math.max(0.55, w / 1280),
          entries = map.legend.slice(0, 5),
          line = 20 * k;
        const box = Math.min(rw - 16 * k, 310 * k),
          top = y + rh - 22 * k - entries.length * line;
        ctx.fillStyle = "#11222bd9";
        ctx.fillRect(x + 8 * k, top, box, entries.length * line + 4 * k);
        ctx.font = `${12 * k}px system-ui`;
        entries.forEach((item, i) => {
          ctx.fillStyle = item.color;
          ctx.fillRect(x + 14 * k, top + 7 * k + i * line, 8 * k, 8 * k);
          ctx.fillStyle = "#fff";
          ctx.fillText(
            String(item.name),
            x + 29 * k,
            top + 15 * k + i * line,
            Math.max(1, box - 28 * k),
          );
        });
      }
      ctx.fillStyle = "#11222bbd";
      ctx.fillRect(x, y + rh - 14, rw, 14);
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(7, Math.min(10, rw / 55))}px Arial`;
      ctx.fillText(map.attribution, x + 4, y + rh - 4, rw - 8);
    } else if (c.kind === "title") {
      const size = ((c.fontSize || 54) * w) / 1280;
      ctx.font = `650 ${size}px system-ui`;
      ctx.fillStyle = c.color || "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#000b";
      ctx.shadowBlur = 4;
      String(c.text || "Dein Titel")
        .split("\n")
        .forEach((line, i, lines) =>
          ctx.fillText(
            line,
            x + rw / 2,
            y + rh / 2 + (i - (lines.length - 1) / 2) * size * 1.25,
            rw * 0.96,
          ),
        );
    } else {
      const el = elements.get(c.id)?.el;
      if (el) {
        const iw = el.videoWidth || el.naturalWidth,
          ih = el.videoHeight || el.naturalHeight;
        if (iw && ih) {
          const ratio = (c.fit === "cover" ? Math.max : Math.min)(
            rw / iw,
            rh / ih,
          );
          if (c.fit !== "cover") {
            ctx.fillStyle = "#102027";
            ctx.fillRect(x, y, rw, rh);
          }
          ctx.drawImage(
            el,
            x + (rw - iw * ratio) / 2,
            y + (rh - ih * ratio) / 2,
            iw * ratio,
            ih * ratio,
          );
        }
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (flightClip?.showStats !== false && flightClip && map.readouts?.length)
    drawReadouts(ctx, flightClip, map.readouts, time, language);
  if (!layers.length) {
    ctx.fillStyle = "#829393";
    ctx.textAlign = "center";
    ctx.font = `${Math.round(w / 50)}px system-ui`;
    ctx.fillText(
      t(state.clips.length
        ? "Kein Clip an dieser Position"
        : "Dein nächster Film beginnt hier.", language),
      w / 2,
      h / 2,
    );
    ctx.textAlign = "left";
  }
}
function drawReadouts(ctx, clip, rows, time, language) {
  const r = readoutRect(clip, rows.length), w = r.w * ctx.canvas.width,
    h = r.h * ctx.canvas.height, k = Math.min(w / 600, h / (34 + rows.length * 32));
  ctx.save();
  ctx.translate(r.x * ctx.canvas.width, r.y * ctx.canvas.height);
  ctx.globalAlpha = (clip.opacity ?? 1) * fade(clip, time);
  ctx.fillStyle = "#14262eee";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const left = 16 * k, columns = [.5, .73, .97];
  ctx.font = `${12 * k}px system-ui`; ctx.fillStyle = "#b7c9d0";
  ctx.fillText(t("Flug", language), left, 17 * k);
  ["Höhe", "Tempo", "Steigen"].forEach((label, i) => {
    ctx.textAlign = "right";
    ctx.fillText(t(label, language), w * columns[i], 17 * k);
  });
  rows.forEach((row, i) => {
    const y = (46 + i * 32) * k, p = row.sample;
    ctx.fillStyle = row.color; ctx.beginPath(); ctx.arc(left + 5 * k, y, 5 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.font = `500 ${14 * k}px system-ui`;
    let name = String(row.name), max = w * .34 - left - 21 * k;
    while (name.length > 1 && ctx.measureText(name).width > max) name = name.slice(0, -2) + "…";
    ctx.fillText(name, left + 20 * k, y);
    ctx.textAlign = "right";
    const values = p ? [`${Math.round(p.alt)} m`, `${Math.round(p.speed)} km/h`, `${p.vario >= 0 ? "+" : ""}${p.vario.toFixed(1)} m/s`] : ["— m", "— km/h", "— m/s"];
    values.forEach((value, column) => ctx.fillText(value, w * columns[column], y, w * .18));
  });
  ctx.restore();
}
