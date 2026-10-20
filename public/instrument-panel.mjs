import { availableFields, instrumentFlights, instrumentPreset, createInstrument, instrumentRect } from '/lib/instruments.mjs';
import { getLanguage } from './i18n.mjs';

const element = (tag, text = '', cls = '') => { const e = document.createElement(tag); e.textContent = text; e.className = cls; return e; };
const say = (de, en) => getLanguage() === 'en' ? en : de;
export function installInstruments({ state, commit, select, selected }) {
  const host = document.getElementById('instruments-panel');
  host.setAttribute('translate', 'no');
  let source = 'main', field = 'heading';
  function render() {
    const s = state(), flights = instrumentFlights(s), items = s.instruments || [];
    if (!flights.some(f => f.id === source)) source = flights[0]?.id || 'main';
    host.replaceChildren();
    const intro = element('p', say('Einzelne Instrumente über Video und Karte. Im Modus Fensterposition direkt ziehen und an der Ecke skalieren. Auch im Export.', 'Independent instruments over video and map. Drag and resize at a corner in Window position mode. Included in exports.'), 'hint');
    host.append(intro);
    if (!flights.length) { host.append(element('p', say('Zuerst unter Flüge eine Flugdatei importieren.', 'First import a flight file under Flights.'))); return; }
    const check = (title, checked, change) => {
      const label = element('label', '', 'check'), input = element('input'); input.type = 'checkbox'; input.checked = checked;
      input.onchange = () => commit(() => change(input.checked)); label.append(input, document.createTextNode(title)); return label;
    };
    host.append(check(say('Instrumente anzeigen', 'Show instruments'), s.instrumentsVisible !== false, value => { s.instrumentsVisible = value; }));
    const selectInput = (title, values, value, change) => {
      const label = element('label', title), input = element('select');
      for (const [id, text] of values) { const option = element('option', text); option.value = id; input.append(option); }
      input.value = value; input.onchange = () => change(input.value); label.append(input); return label;
    };
    host.append(selectInput(say('Flug für neue Instrumente', 'Flight for new instruments'), flights.map(f => [f.id, f.name]), source, value => { source = value; render(); }));
    const fields = availableFields(flights.find(f => f.id === source)?.flight);
    if (!fields.some(f => f.id === field)) field = fields[0]?.id || 'heading';
    const add = values => commit(() => {
      s.instruments ||= [];
      for (const value of values) if (s.instruments.length < 100) s.instruments.push(value);
      s.instrumentsVisible = true; select(s.instruments.at(-1)?.id);
    });
    const preset = element('button', say('＋ Grundlayout: Kompass, Vario, Höhe, Tempo, Zeit', '＋ Starter layout: compass, vario, altitude, speed, time'), 'wide');
    preset.onclick = () => add(instrumentPreset(source).filter(v => !items.some(i => i.field === v.field && i.flightId === v.flightId)));
    host.append(preset);
    host.append(selectInput(say('Einzelne Anzeige / IGC-Feld', 'Individual display / IGC field'), fields.map(f => [f.id, f.label[getLanguage()]]), field, value => { field = value; }));
    const addButton = element('button', say('＋ Anzeige hinzufügen', '＋ Add display'), 'primary wide'); addButton.onclick = () => add([createInstrument(field, source, items.length)]); host.append(addButton);
    const list = element('div', '', 'instrument-list'); host.append(list);
    for (const item of items) {
      const flight = flights.find(f => f.id === item.flightId), def = availableFields(flight?.flight).find(f => f.id === item.field);
      const row = element('div', '', 'instrument-row' + (selected() === item.id ? ' selected' : ''));
      const eye = element('input'); eye.type = 'checkbox'; eye.checked = item.enabled !== false; eye.setAttribute('aria-label', say('Anzeige sichtbar: ', 'Display visible: ') + (def?.label[getLanguage()] || item.field));
      eye.onchange = () => commit(() => { item.enabled = eye.checked; });
      const choose = element('button', (def?.label[getLanguage()] || item.field) + ' · ' + (flight?.name || '?')); choose.onclick = () => { select(item.id); render(); };
      const remove = element('button', '×', 'icon'); remove.setAttribute('aria-label', say('Instrument entfernen', 'Remove instrument'));
      remove.onclick = () => commit(() => { s.instruments = items.filter(i => i.id !== item.id); if (selected() === item.id) select(null); });
      row.append(eye, choose, remove); list.append(row);
    }
    const item = items.find(i => i.id === selected());
    if (item) {
      const section = element('section', '', 'instrument-settings'); host.append(section);
      section.append(element('h3', say('Ausgewählte Anzeige', 'Selected display')));
      section.append(selectInput(say('Datenquelle', 'Data source'), flights.map(f => [f.id, f.name]), item.flightId, value => commit(() => { item.flightId = value; })));
      const spec = availableFields(flights.find(f => f.id === item.flightId)?.flight).find(f => f.id === item.field);
      const styles = [['value', say('Zahlenwert', 'Number')]];
      if (spec?.style && spec.style !== 'value') styles.push([spec.style, say('Instrument mit Skala', 'Instrument with scale')]);
      section.append(selectInput(say('Darstellung', 'Display style'), styles, item.style, value => commit(() => { item.style = value; })));
      const numeric = (title, value, min, max, step, change) => {
        const label = element('label', title), input = element('input'); input.type = 'number'; input.min = min; input.max = max; input.step = step; input.value = value;
        input.onchange = () => { if (input.value !== '' && Number.isFinite(input.valueAsNumber)) commit(() => change(Math.max(min, Math.min(max, input.valueAsNumber)))); };
        label.append(input); return label;
      };
      const positions = element('div', '', 'two-fields');
      const r = instrumentRect(item.rect);
      for (const [key, de, en] of [['x','Links (%)','Left (%)'],['y','Oben (%)','Top (%)'],['w','Breite (%)','Width (%)'],['h','Höhe (%)','Height (%)']])
        positions.append(numeric(say(de, en), +(r[key] * 100).toFixed(1), key === 'x' || key === 'y' ? -200 : 4, 200, .5, value => { item.rect = instrumentRect({ ...r, [key]: value / 100 }); }));
      section.append(positions);
      section.append(numeric(say('Deckkraft (%)', 'Opacity (%)'), Math.round(item.opacity * 100), 0, 100, 5, value => { item.opacity = value / 100; }));
      section.append(numeric(say('Hintergrund (%) · 0 = transparent', 'Background (%) · 0 = transparent'), Math.round(item.background * 100), 0, 100, 5, value => { item.background = value / 100; }));
      if (spec?.derived && ['heading','vario','baroVario','speed','glide'].includes(item.field))
        section.append(numeric(say('Glättung (s) · Original-Flugzeit', 'Smoothing (s) · original flight time'), item.smoothing, 0, 30, 1, value => { item.smoothing = value; }));
      if (!spec) section.append(element('p', say('Dieses Feld fehlt im gewählten Flug. Die Anzeige bleibt leer.', 'This field is missing from the selected flight. The display stays blank.'), 'hint'));
    }
    host.append(element('p', say('GPS-Kurs ist kein Magnetkompass; GPS-Höhe ist keine Höhe über Boden. Berechnete Werte sind gekennzeichnet. Fehlende Daten und GPS-Lücken erscheinen als —. Unbekannte IGC-Felder bleiben Rohwerte ohne angenommene Einheit. Zusätzliche Felder älterer Projekte: IGC erneut importieren.', 'GPS course is not a magnetic compass; GPS altitude is not height above ground. Calculated values are marked. Missing data and GPS gaps display —. Unknown IGC fields stay raw without an assumed unit. For additional fields in older projects, reimport the IGC.'), 'hint'));
    host.append(element('p', say('Für Instrumente ohne Karte: die 3D-Flugspur mit ◉ ausblenden, ihre Clips für die Zeitsynchronisierung behalten.', 'For instruments without a map: hide the 3D flight track with ◉ and keep its clips for time synchronization.'), 'hint'));
  }
  return { render };
}
