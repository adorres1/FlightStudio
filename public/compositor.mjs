import { fade } from "/lib/timeline.mjs";
import { readoutRect } from "/lib/flight-overlays.mjs";
import { imagePlacement, transitionProgress } from "/lib/clip-effects.mjs";
import { translate as t } from "./i18n.mjs";

const buffers = new WeakMap();
function surfaces(ctx) {
  let value = buffers.get(ctx);
  if (!value) { value = [document.createElement('canvas'), document.createElement('canvas')]; buffers.set(ctx, value); }
  for (const canvas of value) if (canvas.width !== ctx.canvas.width || canvas.height !== ctx.canvas.height) {
    canvas.width = ctx.canvas.width; canvas.height = ctx.canvas.height;
  }
  return value.map(canvas => canvas.getContext('2d'));
}
function content(ctx, c, r, elements, map) {
  const w = ctx.canvas.width, h = ctx.canvas.height, x = r.x*w, y = r.y*h, rw = r.w*w, rh = r.h*h;
  ctx.clearRect(0, 0, w, h); ctx.save(); ctx.beginPath(); ctx.rect(x, y, rw, rh); ctx.clip();
  if (c.kind === 'flight') {
    ctx.drawImage(map.canvas, x, y, rw, rh);
    if (c.showStats === false && map.legend.length > 1) {
      const k = Math.max(.55, w/1280), entries = map.legend.slice(0, 5), line = 20*k;
      const box = Math.min(rw-16*k, 310*k), top = y+rh-22*k-entries.length*line;
      ctx.fillStyle = '#11222bd9'; ctx.fillRect(x+8*k, top, box, entries.length*line+4*k);
      ctx.font = 12*k+'px system-ui';
      entries.forEach((item, i) => {
        ctx.fillStyle = item.color; ctx.fillRect(x+14*k, top+7*k+i*line, 8*k, 8*k);
        ctx.fillStyle = '#fff'; ctx.fillText(String(item.name), x+29*k, top+15*k+i*line, Math.max(1, box-28*k));
      });
    }
  } else if (c.kind === 'title') {
    const size = (c.fontSize || 54)*w/1280;
    ctx.font = '650 '+size+'px system-ui'; ctx.fillStyle = c.color || '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#000b'; ctx.shadowBlur = 4;
    String(c.text || 'Dein Titel').split('\n').forEach((line, i, lines) =>
      ctx.fillText(line, x+rw/2, y+rh/2+(i-(lines.length-1)/2)*size*1.25, rw*.96));
  } else {
    const el = elements.get(c.id)?.el, iw = el?.videoWidth || el?.naturalWidth, ih = el?.videoHeight || el?.naturalHeight;
    if (iw && ih) {
      const image = imagePlacement(c, {x,y,w:rw,h:rh}, iw, ih);
      ctx.fillStyle = '#102027'; ctx.fillRect(x,y,rw,rh);
      ctx.drawImage(el, image.x, image.y, image.w, image.h);
    }
  }
  ctx.restore();
}
export function drawFrame(ctx, { state, layers, elements, map, rects, transitions = new Map(), time, flightClip, language = 'de' }) {
  const w = ctx.canvas.width, h = ctx.canvas.height, [layer, group] = surfaces(ctx);
  ctx.globalAlpha = 1; ctx.fillStyle = state.background || '#17252a'; ctx.fillRect(0,0,w,h);
  const outgoing = new Set([...transitions.values()].map(tr => tr.previous.id));
  const paint = (target, clip, weight = 1, operation = 'source-over') => {
    const rect = rects.get(clip.id); if (!rect) return;
    content(layer, clip, rect, elements, map);
    target.save(); target.globalCompositeOperation = operation;
    target.globalAlpha = (clip.opacity ?? 1)*fade(clip,time)*weight;
    target.drawImage(layer.canvas,0,0); target.restore();
  };
  for (const c of layers) {
    if (outgoing.has(c.id)) continue;
    const tr = transitions.get(c.id);
    if (!tr) { paint(ctx,c); continue; }
    const progress = transitionProgress(tr,time);
    group.clearRect(0,0,w,h);
    if (tr.type === 'wipe') {
      paint(group,tr.previous);
      const r = rects.get(c.id); group.save(); group.beginPath();
      group.rect(r.x*w,r.y*h,r.w*w*progress,r.h*h); group.clip();
      group.clearRect(0,0,w,h); paint(group,c); group.restore();
    } else {
      paint(group,tr.previous,1-progress); paint(group,c,progress,'lighter');
    }
    ctx.drawImage(group.canvas,0,0);
  }
  if (flightClip?.showStats !== false && flightClip && map.readouts?.length)
    drawReadouts(ctx, flightClip, map.readouts, time, language);
  // Keep provider attribution visible even when a map window extends off-screen.
  if (flightClip) {
    const r=rects.get(flightClip.id), x=Math.max(0,r.x*w), right=Math.min(w,(r.x+r.w)*w), bottom=Math.min(h,(r.y+r.h)*h);
    if (right>x && bottom>Math.max(0,r.y*h)) {
      ctx.save(); ctx.globalAlpha=(flightClip.opacity ?? 1)*fade(flightClip,time);
      ctx.fillStyle='#11222bdd'; ctx.fillRect(x,Math.max(0,bottom-14),right-x,14);
      ctx.fillStyle='#fff'; ctx.font='9px Arial'; ctx.textAlign='left';
      ctx.fillText(map.attribution,x+4,bottom-4,Math.max(1,right-x-8)); ctx.restore();
    }
  }
  if (!layers.length) {
    ctx.fillStyle='#829393'; ctx.textAlign='center'; ctx.font=Math.round(w/50)+'px system-ui';
    ctx.fillText(t(state.clips.length ? 'Kein Clip an dieser Position' : 'Dein nächster Film beginnt hier.',language),w/2,h/2);
    ctx.textAlign='left';
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
