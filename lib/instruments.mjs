import { sampleFlight, haversine } from './flight.mjs';
import { overlayTime, flightName } from './flight-overlays.mjs';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const words = (de, en) => ({ de, en });
const field = (id, de, en, unit = '', style = 'value', derived = false) => ({ id, label: words(de, en), unit, style, derived });
export const baseFields = [
  field('heading', 'Kompass · GPS-Kurs', 'Compass · GPS course', '°', 'compass', true),
  field('vario', 'Vario · GPS', 'Vario · GPS', 'm/s', 'vario', true),
  field('altitude', 'GPS-Höhe', 'GPS altitude', 'm', 'altitude'),
  field('speed', 'Geschwindigkeit über Grund', 'Ground speed', 'km/h', 'value', true),
  field('clock', 'Uhrzeit · UTC', 'Time · UTC'),
  field('elapsed', 'Flugzeit', 'Flight time', '', 'value', true),
  field('distance', 'Geflogene Strecke', 'Distance flown', 'km', 'value', true),
  field('glide', 'Gleitzahl über Grund', 'Ground glide ratio', ':1', 'value', true),
  field('latitude', 'Breitengrad', 'Latitude', '°'),
  field('longitude', 'Längengrad', 'Longitude', '°'),
  field('pressure', 'Druckhöhe · Standardatmosphäre', 'Pressure altitude · standard atmosphere', 'm'),
  field('baroVario', 'Vario · Druckhöhe', 'Vario · pressure altitude', 'm/s', 'vario', true),
  field('satellites', 'Satelliten · Anzahl', 'Satellites · count'),
];
const known = {
  FXA: ['GPS-Genauigkeit', 'Fix accuracy', 'm'], SIU: ['Satelliten in Verwendung', 'Satellites in use', ''],
  ENL: ['Geräuschpegel', 'Engine noise level', ''], IAS: ['Angezeigte Fluggeschwindigkeit', 'Indicated airspeed', 'km/h'],
  HDT: ['Steuerkurs · wahr', 'True heading', '°'], HDM: ['Steuerkurs · magnetisch', 'Magnetic heading', '°'],
  TEN: ['Totalenergie-Höhe', 'Total energy altitude', 'm'], OAT: ['Aussentemperatur', 'Outside temperature', '°C'],
  HUM: ['Luftfeuchtigkeit', 'Humidity', '%'], LEB: ['Akkuladung', 'Battery charge', '%'],
  VAR: ['Vario · aufgezeichnet', 'Vario · recorded', 'm/s', .1],
  VAT: ['Kompensiertes Vario · aufgezeichnet', 'Compensated vario · recorded', 'm/s', .1],
};
const availability = new WeakMap();
export function availableFields(flight) {
  if (!flight) return [];
  if (availability.has(flight)) return availability.get(flight);
  const points = flight.points || [], pressure = points.some(p => Number.isFinite(p.pressure) && p.pressure !== 0);
  const fields = baseFields.filter(f => !['pressure', 'baroVario'].includes(f.id) || pressure)
    .filter(f => f.id !== 'satellites' || flight.satelliteRecords?.length);
  const codes = new Set(flight.extensionCodes || []);
  for (const p of points) for (const code of Object.keys(p.extensions || {})) codes.add(code);
  for (const record of flight.telemetry || []) for (const code of Object.keys(record.fields || {})) codes.add(code);
  for (const code of [...codes].sort()) {
    if (!/^[A-Z0-9]{3}$/.test(code)) continue;
    const k = known[code];
    fields.push({ ...field('ext:' + code, k ? `${code} · ${k[0]}` : `${code} · Rohwert`, k ? `${code} · ${k[1]}` : `${code} · raw value`, k?.[2] || ''), scale: k?.[3] || 1, raw: !k });
  }
  for (const [key, value] of Object.entries(flight.headers || {}))
    if (typeof value === 'string' && value) fields.push(field('meta:' + key, `IGC-Info · ${key}`, `IGC info · ${key}`));
  availability.set(flight, fields);
  return fields;
}
export function instrumentFlights(state) {
  return [...(state.flight ? [{ id: 'main', flight: state.flight, name: flightName(state.flight), color: '#f28143' }] : []),
    ...(state.flightOverlays || []).map(o => ({ ...o, name: o.name || flightName(o.flight) }))];
}
export function instrumentRect(rect = {}) {
  const number = (key, fallback, min, max) => Number.isFinite(rect[key]) ? clamp(rect[key], min, max) : fallback;
  return { x: number('x', .77, -2, 2), y: number('y', .08, -2, 2), w: number('w', .2, .04, 2), h: number('h', .12, .04, 2) };
}
export function createInstrument(fieldId, flightId = 'main', index = 0, id = crypto.randomUUID()) {
  const f = baseFields.find(f => f.id === fieldId);
  return { id, field: fieldId, flightId, enabled: true, opacity: 1, background: .55, smoothing: 3, style: f?.style || 'value',
    rect: instrumentRect({ x: .76 - Math.floor(index / 5) * .23, y: .06 + index % 5 * .17, w: .21, h: .13 }) };
}
export function instrumentPreset(flightId = 'main') {
  return ['clock','speed','vario','altitude','heading'].map((f, i) => {
    const item = createInstrument(f, flightId, i);
    if (f === 'altitude') item.rect = { x: .84, y: .54, w: .13, h: .4 };
    if (f === 'heading') item.rect = { x: .38, y: .76, w: .24, h: .21 };
    return item;
  });
}
export function validateInstruments(items) {
  if (items == null) return;
  if (!Array.isArray(items) || items.length > 100) throw new Error('Ungültige Instrumente.');
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        typeof item.flightId !== 'string' || typeof item.field !== 'string' || item.field.length > 200 ||
        !['value','compass','vario','altitude'].includes(item.style) ||
        ![item.opacity, item.background, item.smoothing].every(Number.isFinite) ||
        item.opacity < 0 || item.opacity > 1 || item.background < 0 || item.background > 1 || item.smoothing < 0 || item.smoothing > 30)
      throw new Error('Ungültige Instrument-Einstellungen.');
    if (item.rect && !['x','y','w','h'].every(k => Number.isFinite(item.rect[k]))) throw new Error('Ungültige Instrument-Position.');
    ids.add(item.id); item.rect = instrumentRect(item.rect);
  }
}
export function instrumentClock(state, editTime) {
  if (!state.flight) return null;
  // Hidden map tracks still define synchronization. A removed flight section
  // leaves no data rather than inventing an unrelated clock.
  const c = state.clips.find(c => c.kind === 'flight' && c.enabled !== false && editTime >= c.start && editTime < c.start + (c.out - c.in) / c.rate);
  return c ? state.flight.start + (c.in + (editTime - c.start) * c.rate) * 1000 : null;
}
function atOrBefore(records, time) {
  if (!records?.length || records[0].time > time) return null;
  let a = 0, b = records.length - 1;
  while (a < b) { const m = Math.ceil((a + b) / 2); if (records[m].time <= time) a = m; else b = m - 1; }
  return time - records[a].time <= 120000 ? records[a] : null;
}
export function bearing(a, b) {
  if (haversine(a, b) < 1) return null;
  const r = Math.PI / 180, d = (b.lon - a.lon) * r;
  return (Math.atan2(Math.sin(d) * Math.cos(b.lat * r),
    Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(d)) / r + 360) % 360;
}
export function instrumentReading(state, item, editTime, language = 'de') {
  const entry = instrumentFlights(state).find(f => f.id === item.flightId);
  const def = availableFields(entry?.flight).find(f => f.id === item.field);
  const result = { label: def?.label[language] || item.field, value: '—', number: null, unit: def?.unit || '',
    name: entry?.name || (language === 'en' ? 'Flight missing' : 'Flug fehlt'), color: entry?.color || '#93a6b2',
    derived: def?.derived || false, raw: def?.raw || false };
  const clock = instrumentClock(state, editTime);
  if (!entry || clock === null) return result;
  const flight = entry.flight, time = entry.id === 'main' ? clock : overlayTime(entry, state.flight, clock), p = sampleFlight(flight, time);
  if (!p) return result;
  let value = null;
  const key = item.field;
  if (key.startsWith('meta:')) value = flight.headers?.[key.slice(5)];
  else if (key.startsWith('ext:')) {
    const code = key.slice(4), extra = atOrBefore(flight.telemetry, time);
    // An I-record field is tied to this fix; J/K fields are held for at most 120s.
    value = p.extensions?.[code] ?? extra?.fields?.[code] ?? null;
    if (value !== null && known[code] && /^-?\d+(?:\.\d+)?$/.test(value)) value = Number(value) * (def?.scale || 1);
  } else if (key === 'clock') value = new Date(time).toISOString().slice(11, 19);
  else if (key === 'elapsed') {
    const seconds = Math.floor((time - flight.start) / 1000);
    value = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2,'0')).join(':');
  } else if (key === 'altitude') value = p.alt;
  else if (key === 'pressure') value = def ? p.pressure : null;
  else if (key === 'latitude') value = p.lat;
  else if (key === 'longitude') value = p.lon;
  else if (key === 'distance') value = p.distance / 1000;
  else if (key === 'satellites') value = atOrBefore(flight.satelliteRecords, time)?.ids?.length;
  else {
    const current = flight.points[p.index], previous = flight.points[Math.max(0, p.index - (time === current.time ? 1 : 0))];
    const from = item.smoothing > 0 ? Math.max(flight.start, time - item.smoothing * 1000) : previous.time;
    const a = sampleFlight(flight, from), dt = a ? (time - a.time) / 1000 : 0;
    // No derivatives spanning a logger gap or extrapolation at the first fix.
    if (dt > 0 && !flight.points.slice(a.index + 1, p.index + 2).some(q => q.time <= time && q.gap)) {
      const speed = (p.distance - a.distance) / dt * 3.6, vario = (p.alt - a.alt) / dt;
      if (key === 'heading') value = bearing(a, p);
      if (key === 'speed') value = speed;
      if (key === 'vario') value = vario;
      if (key === 'baroVario' && def && Number.isFinite(p.pressure) && Number.isFinite(a.pressure)) value = (p.pressure - a.pressure) / dt;
      if (key === 'glide' && vario < -.1 && speed > 1) value = speed / 3.6 / -vario;
    }
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return result;
    result.number = value;
    const digits = ['latitude','longitude'].includes(key) ? 5 : key === 'distance' ? 2 : ['vario','baroVario','glide','ext:VAR','ext:VAT'].includes(key) ? 1 : 0;
    result.value = ((key === 'vario' || key === 'baroVario' || key === 'ext:VAR' || key === 'ext:VAT') && value > 0 ? '+' : '') + value.toFixed(digits);
  } else if (value != null && value !== '') result.value = String(value).slice(0, 300);
  return result;
}
