import { instrumentReading, instrumentRect } from '/lib/instruments.mjs';

export function drawInstruments(ctx, state, time, language = 'de') {
  if (state.instrumentsVisible === false) return;
  for (const item of state.instruments || []) {
    if (item.enabled === false) continue;
    const reading = instrumentReading(state, item, time, language);
    const r = instrumentRect(item.rect), w = r.w * ctx.canvas.width, h = r.h * ctx.canvas.height;
    const scale = Math.min(w / 240, h / 110), pad = 12 * scale;
    ctx.save(); ctx.translate(r.x * ctx.canvas.width, r.y * ctx.canvas.height);
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); ctx.globalAlpha = item.opacity;
    ctx.fillStyle = `rgba(9,24,34,${item.background})`;
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 12 * scale); ctx.fill();
    ctx.shadowColor = '#000a'; ctx.shadowBlur = 3 * scale;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = reading.color; ctx.beginPath(); ctx.arc(pad + 3 * scale, 14 * scale, 3 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c4dce5'; ctx.font = `500 ${10 * scale}px system-ui`;
    ctx.fillText(reading.name, pad + 12 * scale, 14 * scale, w - pad * 2 - 12 * scale);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${11 * scale}px system-ui`;
    ctx.fillText(reading.label, pad, 32 * scale, w - pad * 2);
    const label = reading.derived ? (language === 'en' ? 'CALCULATED' : 'BERECHNET')
      : reading.raw ? (language === 'en' ? 'IGC RAW VALUE' : 'IGC-ROHWERT') : (language === 'en' ? 'RECORDED' : 'AUFGEZEICHNET');
    ctx.fillStyle = '#bed3df'; ctx.font = `500 ${8 * scale}px system-ui`;
    ctx.fillText(label, pad, h - 9 * scale, w - pad * 2);
    if (item.style === 'compass' && item.field === 'heading') compass(ctx, reading, w, h, scale);
    else if (item.style === 'altitude' && ['altitude','pressure'].includes(item.field)) altitude(ctx, reading, w, h, scale);
    else if (item.style === 'vario' && /vario/i.test(item.field)) vario(ctx, reading, w, h, scale);
    else value(ctx, reading, pad, h * .64, w - pad * 2, scale);
    ctx.restore();
  }
}
function value(ctx, reading, x, y, width, scale) {
  ctx.fillStyle = '#fff'; ctx.font = `650 ${25 * scale}px system-ui`;
  ctx.fillText(reading.value + (reading.unit ? ' ' + reading.unit : ''), x, y, Math.max(1, width));
}
function compass(ctx, reading, w, h, scale) {
  const course = reading.number, center = w / 2, y = h * .57, span = w * .84;
  ctx.strokeStyle = '#adcad9'; ctx.lineWidth = scale; ctx.textAlign = 'center';
  if (course !== null) for (let degree = Math.floor((course - 70) / 10) * 10; degree <= course + 70; degree += 10) {
    const x = center + (degree - course) / 140 * span, wrapped = (degree % 360 + 360) % 360;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (degree % 30 === 0 ? 10 : 5) * scale); ctx.stroke();
    if (degree % 30 === 0) {
      ctx.fillStyle = '#e5f5fa'; ctx.font = `600 ${11 * scale}px system-ui`;
      ctx.fillText(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' })[wrapped] || String(wrapped), x, y - 9 * scale);
    }
  }
  ctx.fillStyle = '#5ee2cf'; ctx.beginPath(); ctx.moveTo(center, y - 1); ctx.lineTo(center - 4 * scale, y - 8 * scale); ctx.lineTo(center + 4 * scale, y - 8 * scale); ctx.fill();
  ctx.font = `650 ${20 * scale}px system-ui`; ctx.fillText(reading.value + '°', center, h * .79); ctx.textAlign = 'left';
}
function altitude(ctx, reading, w, h, scale) {
  const center = h * .57, step = Math.max(17 * scale, (h - 60 * scale) / 10), x = w * .77;
  if (reading.number !== null) {
    const altitude = reading.number;
    ctx.strokeStyle = '#a9c9d9'; ctx.lineWidth = scale; ctx.font = `500 ${10 * scale}px system-ui`;
    for (let n = Math.floor((altitude - 125) / 25) * 25; n <= altitude + 125; n += 25) {
      const y = center - (n - altitude) / 25 * step;
      if (y < 44 * scale || y > h - 22 * scale) continue;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (n % 100 === 0 ? 18 : 9) * scale, y); ctx.stroke();
      if (n % 100 === 0) { ctx.fillStyle = '#d0e4ed'; ctx.textAlign = 'right'; ctx.fillText(String(n), x - 5 * scale, y, w * .5); }
    }
  }
  ctx.fillStyle = '#143d48'; ctx.fillRect(5 * scale, center - 15 * scale, w * .69, 30 * scale);
  ctx.textAlign = 'left'; value(ctx, reading, 11 * scale, center, w * .62, scale * .8);
  ctx.fillStyle = '#5ee2cf'; ctx.beginPath(); ctx.moveTo(x, center); ctx.lineTo(x - 7 * scale, center - 5 * scale); ctx.lineTo(x - 7 * scale, center + 5 * scale); ctx.fill();
}
function vario(ctx, reading, w, h, scale) {
  value(ctx, reading, 12 * scale, h * .62, w * .72, scale);
  const x = w * .88, top = 45 * scale, bottom = h - 22 * scale, middle = (top + bottom) / 2;
  ctx.strokeStyle = '#b1cad7'; ctx.lineWidth = 2 * scale;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.moveTo(x - 6 * scale, middle); ctx.lineTo(x + 6 * scale, middle); ctx.stroke();
  if (reading.number !== null) {
    const amount = Math.max(-5, Math.min(5, reading.number)) / 5 * (bottom - top) / 2;
    ctx.fillStyle = reading.number >= 0 ? '#5ee2cf' : '#ffb47f';
    ctx.fillRect(x - 4 * scale, Math.min(middle, middle - amount), 8 * scale, Math.max(scale, Math.abs(amount)));
  }
}
