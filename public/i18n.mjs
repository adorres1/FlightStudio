import { english } from "./messages-en.mjs";
let language = "de";
try { language = localStorage.getItem("flightstudio-language") === "en" ? "en" : "de"; } catch {}
export const getLanguage = () => language;
const normalize = (value) => value.replace(/\s+/g, " ").trim();
export function translate(value, lang = language) {
  if (lang !== "en") return value;
  const text = normalize(String(value));
  if (Object.hasOwn(english, text)) return english[text];
  const patterns = [
    [/^(.*)× automatisch$/, (_, rate) => `${rate}× automatic`],
    [/^(.*) · Zeitstempel$/, (_, text) => `${text} · timestamp`],
    [/^Film ca\. (.*) · Timeline (.*) · (\d+) Clips$/, (_, film, timeline, count) => `Film approx. ${film} · Timeline ${timeline} · ${count} clips`],
    [/^Flug (.*)×$/, (_, rate) => `Flight ${rate}×`],
    [/^(\d+) Medien fehlen\. Originale in V2 importieren, danach dieses Projekt erneut öffnen\.$/, (_, n) => `${n} media files missing. Import the originals into V2, then open this project again.`],
    [/^„(.*)“ kann im Browser nicht abgespielt werden\. Für Video bitte MP4 mit H\.264\/AAC verwenden\.$/, (_, name) => `“${name}” cannot be played. For video, use MP4 with H.264/AAC.`],
    [/^(\d+) Clips ausgewählt$/, (_, n) => `${n} clips selected`],
    [/^Ein · freie Flugabschnitte (.+)×$/, (_, n) => `On · flight-only sections ${n}×`],
    [/^(.*) · (\d+) GPS-Punkte$/, (_, name, n) => `${name} · ${n} GPS points`],
    [/^Bildposition (.*)$/, (_, name) => `Frame position ${name}`],
    [/^(MP4|WEBM) speichern ↓$/, (_, format) => `${format} save ↓`],
    [/^(.*) · Film ca\. (.*) · (.*) · (\d+) Spuren$/, (_, range, time, ratio, count) => `${range} · Film approx. ${time} · ${ratio} · ${count} tracks`],
    [/^Zeitzone: (.*?)\. Bereits entfernte Abschnitte oder Tempoänderungen in Insta360 sind nicht automatisch erkennbar\.$/, (_, zone) => `Time zone: ${zone}. Cuts and speed changes already made in Insta360 cannot be detected automatically.`],
    [/^(.*) · (Hohe Auflösung\/Bildrate:.*|Die Exportauflösung ist unabhängig von der Vorschau\.)$/, (_, size, note) => `${size} · ${translate(note, lang)}`],
    [/^(.*) · (\d+) % · Du kannst dieses Fenster schliessen\.$/, (_, label, percent) => `${translate(label, lang)} · ${percent} % · You can close this window.`],
    [/^Start fehlgeschlagen: (.*)$/, (_, error) => `Startup failed: ${translate(error, lang)}`],
    [/^(.+): (.+)$/, (_, prefix, suffix) => `${translatePart(prefix)}: ${translatePart(suffix)}`],
  ];
  const translatePart = (part) => english[part] || part;
  for (const [pattern, render] of patterns) if (pattern.test(text)) return text.replace(pattern, render);
  return value;
}

// Translate presentation nodes only. Input values, project names, filenames,
// captions and other user content never pass through the language catalogue.
export async function installLanguageUI() {
  try { const saved = await window.flightStudioPrefs?.getLanguage(); if (saved) language = saved; } catch {}
  const originals = new WeakMap();
  const skip = 'script,style,textarea,[translate="no"]';
  const attributes = ["title", "aria-label", "placeholder"];
  const translateNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.closest(skip) || !node.data.trim()) return;
      const old = originals.get(node);
      const source = old && node.data === old.output ? old.source : node.data;
      const output = source.match(/^\s*/)[0] + translate(source.trim()) + source.match(/\s*$/)[0];
      originals.set(node, { source, output });
      if (node.data !== output) node.data = output;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.matches(skip)) return;
      let values = originals.get(node) || {};
      for (const name of attributes) {
        const current = node.getAttribute(name);
        if (current === null) continue;
        const old = values[name], source = old && current === old.output ? old.source : current;
        const output = translate(source);
        values[name] = { source, output };
        if (current !== output) node.setAttribute(name, output);
      }
      originals.set(node, values);
      for (const child of node.childNodes) translateNode(child);
    }
  };
  const observe = () => observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  const observer = new MutationObserver((records) => {
    observer.disconnect();
    const roots = new Set(records.map((record) => record.target));
    for (const root of roots) if (root.isConnected) translateNode(root);
    observe();
  });
  const apply = () => {
    observer.disconnect();
    document.documentElement.lang = language;
    document.title = language === "en" ? "FlightStudio V2 · Video editor" : "FlightStudio V2 · Schnittwerkstatt";
    document.getElementById("language").value = language;
    translateNode(document.body);
    observe();
  };
  document.getElementById("language").onchange = async (event) => {
    language = event.target.value === "en" ? "en" : "de";
    try { localStorage.setItem("flightstudio-language", language); } catch {}
    apply();
    try { await window.flightStudioPrefs?.setLanguage(language); } catch {}
    window.dispatchEvent(new Event("flightstudio-language"));
  };
  apply();
}
