import { instrumentRect, instrumentReading } from '/lib/instruments.mjs';
import { installInstruments } from './instrument-panel.mjs';
import { DateTime } from "luxon";
import { parseCaptureTime } from "/lib/time.mjs";
import { finalizeFlight, toKML } from "/lib/flight.mjs";
import { makeOverlay, readoutRect, flightName } from "/lib/flight-overlays.mjs";
import { effectScene, transitionFor, applyTransition, connectOverlap, imageTransform } from '/lib/clip-effects.mjs';
import { convertV1 } from "./migrate-v1.mjs";
import { validateCameraFrame } from "/lib/camera.mjs";
import {
  clamp,
  length,
  end,
  active,
  sourceTime,
  sequenceDuration,
  makeClip,
  splitClip,
  editRange,
  snapTime,
  fitsTrack,
  timedClips,
  layoutRects,
  sceneLayout,
  removeTrack,
  normalizedRect,
  validateProject,
  playbackIntervals,
  playbackRateAt,
  outputDuration,
  advancePlayback,
  clipMapSettings,
} from "/lib/timeline.mjs";
import { renderClipEffects } from "./clip-inspector-effects.mjs";
import { FlightMap } from "./map-v2.mjs";
import { MediaEngine } from "./media-engine.mjs";
import { drawFrame } from "./compositor.mjs";
import { RecorderExporter } from "./export-v2.mjs";
import { BackgroundExporter } from "./background-export.mjs";
import { installUpdates } from "./updates.mjs";
import { renderExport } from "./render-export.mjs";
import { pixelSize } from "/lib/export-settings.mjs";
import { installLanguageUI, getLanguage, translate as t } from "./i18n.mjs";
import { installThemeUI } from "./theme.mjs";
import { installTutorial } from "./tutorial.mjs";
const renderJob = new URLSearchParams(location.search).get("renderJob");
// Hidden native windows do not reliably receive compositor animation frames.
// The export renderer owns a regular timer; its Chromium background throttling is disabled.
const nextFrame = (callback) =>
  renderJob
    ? setTimeout(() => callback(performance.now()), 1000 / 30)
    : requestAnimationFrame(callback);
const $ = (id) => document.getElementById(id),
  uid = () => crypto.randomUUID(),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const format = (t) => {
  const frames = Math.max(0, Math.round(t * 30)),
    seconds = Math.floor(frames / 30);
  return (
    (seconds >= 3600
      ? String(Math.floor(seconds / 3600)).padStart(2, "0") + ":"
      : "") +
    String(Math.floor((seconds % 3600) / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0") +
    "." +
    String(frames % 30).padStart(2, "0")
  );
};
const fresh = () => ({
  version: 2,
  name: "Mein Flugfilm",
  assets: [],
  clips: [],
  tracks: [
    {
      id: "video-1",
      name: "Video 1",
      kind: "video",
      visible: true,
      muted: false,
      locked: false,
    },
  ],
  flight: null,
  flightOverlays: [],
  instruments: [],
  instrumentsVisible: true,
  origin: null,
  zone: "Europe/Zurich",
  layout: "auto",
  aspect: "16:9",
  background: "#17252a",
  gaps: { enabled: false, speed: 50, explicit: true },
  map: {
    style: "satellite",
    opacity: 0.65,
    camera: "follow",
    frames: [],
    initial: null,
    heading: 0.3,
    pitch: -0.65,
    range: 4000,
  },
});
let S = fresh(),
  token = "",
  map,
  engine,
  exporter,
  selected = [],
  selectedAsset = null,
  filter = "all",
  zoom = 0,
  px = 10,
  rangeAuto = true,
  arrange = true,
  snapping = true,
  dragging = false,
  handleKey = "",
  last = 0,
  saveTimer,
  toastTimer,
  saving = false;
let replaceFlightNext = false;
let activePanel = null;
let activeGallery = "media";
let tutorial = null;
let instrumentPanel = null, selectedInstrument = null;
function selectInstrument(id) { selectedInstrument = id; selected = []; handleKey = ""; renderSelection(); showPanel("instruments"); }
function showGallery(name) {
  activeGallery = name;
  $("library").hidden = !name;
  document.querySelector(".studio").classList.toggle("gallery-closed", !name);
  $("media-gallery").hidden = name !== "media";
  $("flight-gallery").hidden = name !== "flights";
  $("gallery-title").textContent = name === "flights" ? "Fluggalerie" : "Mediathek";
  if (name !== "media") closeSourcePreview();
  for (const id of ["media", "flights"]) {
    $("gallery-" + id).setAttribute("aria-expanded", name === id);
    $("gallery-" + id).classList.toggle("active", name === id);
  }
  fitStage();
}
function showPanel(name) {
  activePanel = name;
  $("inspector").hidden = !name;
  document.querySelector(".studio").classList.toggle("panel-open", !!name);
  $("inspector-content").hidden = name !== "clip";
  $("inspector-kind").hidden = name !== "clip";
  $("camera-panel").hidden = name !== "camera";
  $("project-panel").hidden = name !== "project";
  $("instruments-panel").hidden = name !== "instruments";
  if (name === "instruments") instrumentPanel?.render();
  $("panel-title").textContent = { instruments: "Instrumente", clip: "Eigenschaften", camera: "Flugkarte & Kamera", project: "Projekt-Einstellungen" }[name] || "Eigenschaften";
  for (const id of ["clip", "camera", "instruments", "project"]) {
    $("panel-" + id).setAttribute("aria-expanded", name === id);
    $("panel-" + id).classList.toggle("active", name === id);
  }
  fitStage();
}
const history = [],
  future = [];
let intervals = [];
let compact = true;
const viewTime = (t) =>
    compact
      ? outputDuration(intervals, 0, t) +
        Math.max(0, t - sequenceDuration(S.clips))
      : t,
  editTime = (t) =>
    compact
      ? advancePlayback(intervals, 0, t) +
        Math.max(0, t - outputDuration(intervals))
      : t;
const app = {
  get state() {
    return S;
  },
  get canvas() {
    return $("preview");
  },
  time: 0,
  speed: 1,
  playing: false,
  exporting: false,
  range: [0, 0],
  outputLength: (from = 0, to = Infinity) =>
    outputDuration(intervals, from, to),
  layers: [],
  rects: new Map(),
  get engine() {
    return engine;
  },
};
app.toast = (text, error = false) => {
  const el = $("toast");
  el.textContent = text;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 13000 : 5500);
};
app.api = async (url, opts = {}) => {
  const { raw, binary, ...options } = opts,
    headers = { "X-FlightStudio-Token": token, ...options.headers };
  if (options.body && !(options.body instanceof FormData) && !raw)
    headers["Content-Type"] = "application/json";
  const r = await fetch(url, { ...options, headers }),
    data = r.ok && binary ? await r.blob() : await r.json();
  if (!r.ok) throw new Error(data.error || "Aktion fehlgeschlagen.");
  return data;
};
const safe =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      app.toast(e.message, true);
      console.error(e);
    }
  };
const busy = (yes, text = "Material wird vorbereitet …") => {
  $("busy").hidden = !yes;
  $("busy-text").textContent = text;
};
const duration = () => sequenceDuration(S.clips),
  assetFor = (c) => S.assets.find((a) => a.id === c.assetId),
  trackFor = (c) => S.tracks.find((t) => t.id === c.trackId),
  clipName = (c) =>
    c.kind === "flight"
      ? flightName(S.flight)
      : c.kind === "title"
        ? c.text || "Titel"
        : assetFor(c)?.name || "Fehlendes Medium";
const chosen = () => S.clips.filter((c) => selected.includes(c.id)),
  editableChosen = () => chosen().filter((c) => !trackFor(c)?.locked),
  capture = (a) => a?.manualTime ?? parseCaptureTime(a?.capture?.raw, S.zone);
function snapshot() {
  history.push(JSON.stringify({ state: project(), selected }));
  if (history.length > 40) history.shift();
  future.length = 0;
}
function project() {
  return { ...S, playhead: app.time, viewPose: map?.pose(), uiLanguage: getLanguage() };
}
app.project = project;
function scheduleSave() {
  if (renderJob) return;
  clearTimeout(saveTimer);
  saving = true;
  $("save-state").textContent = "Wird gespeichert …";
  saveTimer = setTimeout(async () => {
    try {
      await app.api("/api/project", {
        method: "PUT",
        body: JSON.stringify(project()),
      });
      $("save-state").textContent = "Lokal gespeichert";
    } catch (e) {
      $("save-state").textContent = "Speichern fehlgeschlagen";
      app.toast(e.message, true);
    } finally {
      saving = false;
    }
  }, 450);
}
function changed() {
  map?.syncOverlays(S.flightOverlays || []);
  intervals = playbackIntervals(S);
  app.time = clamp(app.time, 0, duration());
  if (rangeAuto) app.range = [0, duration()];
  else
    app.range = [
      clamp(app.range[0], 0, duration()),
      clamp(app.range[1], 0, duration()),
    ];
  selected = selected.filter((id) => S.clips.some((c) => c.id === id));
  if (selected.length) selectedInstrument = null;
  engine?.prune(S.clips);
  refresh();
  scheduleSave();
}
function undo(redo = false) {
  const from = redo ? future : history,
    to = redo ? history : future;
  if (!from.length) return;
  to.push(JSON.stringify({ state: S, selected }));
  const value = JSON.parse(from.pop());
  S = value.state;
  selected = value.selected;
  app.pause();
  if (S.flight) map.load(S.flight);
  if (S.map.camera === "fixed" && S.viewPose) map.apply(S.viewPose);
  rangeAuto = true;
  changed();
}
app.pause = () => {
  app.playing = false;
  engine?.pause();
};
app.seek = (t) => {
  app.pause();
  app.time = clamp(t, 0, duration());
  handleKey = "";
  app.render();
};
app.size = (short = 720) => {
  const { width, height } = pixelSize(S.aspect, short);
  app.canvas.width = width;
  app.canvas.height = height;
  fitStage();
};
function fitStage() {
  const well = document.querySelector(".preview-well"),
    [a, b] = S.aspect.split(":").map(Number),
    width = Math.min(well.clientWidth - 28, ((well.clientHeight - 28) * a) / b);
  $("stage").style.width = Math.max(100, width) + "px";
  $("stage").style.aspectRatio = a + "/" + b;
}
function availableTrack(kind, start, len, forceNew = false) {
  const category =
    kind === "audio" ? "audio" : kind === "flight" ? "flight" : "video";
  let track =
    !forceNew &&
    S.tracks.find(
      (t) =>
        t.kind === category &&
        !t.locked &&
        fitsTrack(S.clips, t.id, start, len),
    );
  if (!track) {
    const n = S.tracks.filter((t) => t.kind === category).length + 1;
    track = {
      id: uid(),
      name:
        (category === "audio"
          ? "Audio "
          : category === "flight"
            ? "3D-Flug "
            : "Video ") + n,
      kind: category,
      visible: true,
      muted: false,
      locked: false,
    };
    S.tracks.push(track);
  }
  return track.id;
}
function insertAsset(asset, at = null, trackId = null) {
  app.pause();
  closeSourcePreview();
  let clips = [];
  const timestamp = capture(asset);
  if (at === null && timestamp !== null && S.flight)
    clips = timedClips(
      asset,
      timestamp,
      S.flight,
      S.clips.filter((c) => c.kind === "flight"),
      "",
    );
  if (!clips.length) {
    let start = at ?? app.time;
    if (at === null && timestamp !== null && !S.flight) {
      S.origin ??= timestamp;
      if (timestamp < S.origin) {
        const offset = (S.origin - timestamp) / 1000;
        for (const c of S.clips.filter((c) => c.auto)) c.start += offset;
        S.origin = timestamp;
      }
      start = Math.max(0, (timestamp - S.origin) / 1000);
    }
    clips = [
      {
        ...makeClip(asset, "", start),
        auto: at === null && timestamp !== null && !S.flight,
      },
    ];
  }
  for (const c of clips) {
    c.trackId = trackId || availableTrack(asset.type, c.start, length(c));
    S.clips.push(c);
  }
  selected = clips.map((c) => c.id);
  selectedAsset = null;
  app.time = clips[0].start;
  return clips;
}
async function importFiles(files) {
  app.pause();
  snapshot();
  let count = 0;
  try {
    for (const file of files) {
      busy(true, `${file.name} · Import ${++count}/${files.length}`);
      try {
        const data = new FormData();
        data.append("file", file);
        const asset = await app.api("/api/media", {
          method: "POST",
          body: data,
        });
        asset.originalName ??= asset.name;
        S.assets.push(asset);
        if ($("auto-insert").checked) insertAsset(asset);
        else selectedAsset = asset.id;
      } catch (e) {
        app.toast(file.name + ": " + e.message, true);
      }
    }
    changed();
  } finally {
    busy(false);
  }
}
function attachFlight(flight) {
  snapshot();
  app.pause();
  S.flight = flight;
  S.origin = flight.start;
  S.clips = S.clips.filter((c) => c.kind !== "flight");
  S.tracks = S.tracks.filter((t) => t.kind !== "flight");
  const track = availableTrack("flight", 0, (flight.end - flight.start) / 1000);
  const fc = {
    ...makeClip(
      {
        id: "flight",
        type: "flight",
        duration: (flight.end - flight.start) / 1000,
      },
      track,
    ),
    showStats: true,
  };
  S.clips.push(fc);
  map.load(flight);
  S.map.initial = map.pose();
  S.map.frames = [];
  S.map.camera = "follow";
  const autoIds = new Set(
    S.clips.filter((c) => c.auto && c.kind !== "flight").map((c) => c.assetId),
  );
  S.clips = S.clips.filter((c) => !c.auto || c.kind === "flight");
  for (const id of autoIds) {
    const a = S.assets.find((a) => a.id === id);
    if (a) insertAsset(a);
  }
  selected = [fc.id];
  app.time = 0;
  rangeAuto = true;
  changed();
}
async function importFlight(file, replace = false) {
  busy(true, "Flugspur wird gelesen …");
  try {
    const data = new FormData();
    data.append("file", file);
    const flight = await app.api("/api/flight", { method: "POST", body: data });
    if (!S.flight || replace) attachFlight(flight);
    else {
      snapshot();
      S.flightOverlays ||= [];
      S.flightOverlays.push(makeOverlay(flight, S.flightOverlays.length));
      changed();
      app.toast(
        "Weitere Flugspur in derselben Karte ergänzt. Vergleichszeit links einstellbar.",
      );
    }
  } finally {
    busy(false);
  }
}
function renderFlightOverlays() {
  $("flight-count").textContent = S.flight ? 1 + (S.flightOverlays || []).length : 0;
  $("flight-collection").hidden = !S.flight;
  const host = $("flight-overlays");
  if (!S.flight) {
    host.replaceChildren();
    return;
  }
  host.innerHTML = `<article class="flight-card">${flightThumbnail(S.flight, "#f28143")}<div class="flight-reference"><span style="color:#f28143">●</span> <strong translate="no">${esc(flightName(S.flight))}</strong><small>Hauptflug · Zeitgeber</small><small translate="no">${format((S.flight.end - S.flight.start) / 1000)}</small></div><label>Name des Hauptflugs<input id="main-flight-name" type="text" maxlength="100" value="${esc(flightName(S.flight))}"></label><label class="check"><input id="main-name-tag" type="checkbox" ${S.flight.showNameTag ? 'checked' : ''}> Nametag am Flugpunkt</label></article>`;
  $("main-flight-name").onchange = e => { snapshot(); S.flight.displayName = e.target.value.trim().slice(0, 100) || S.flight.name; changed(); };
  $("main-name-tag").onchange = e => { snapshot(); S.flight.showNameTag = e.target.checked; changed(); };
  for (const [index, o] of (S.flightOverlays || []).entries()) {
    const row = document.createElement("div");
    row.className = "flight-overlay-row flight-card";
    row.innerHTML = `${flightThumbnail(o.flight, o.color)}<div class="overlay-heading"><input type="checkbox" aria-label="Flugspur anzeigen" ${o.visible !== false ? "checked" : ""}><input type="color" aria-label="Farbe der Flugspur" value="${esc(o.color)}"><input class="overlay-name" maxlength="100" aria-label="Name der Flugspur" value="${esc(o.name || o.flight.name)}"><button class="icon" aria-label="Zusätzliche Flugspur entfernen">×</button></div><small translate="no">${esc(o.flight.name)} · ${format((o.flight.end - o.flight.start) / 1000)}</small><label class="check"><input class="overlay-name-tag" type="checkbox" ${o.showNameTag !== false ? 'checked' : ''}> Nametag am Flugpunkt</label><details><summary>Zeitzuordnung</summary><label>Vergleichszeit<select aria-label="Zeitzuordnung der Flugspur"><option value="absolute">Tatsächliche Uhrzeit (UTC)</option><option value="start">Flugstarts gleichzeitig</option></select></label><label>Spur später (+s)<input type="number" aria-label="Zeitversatz der Flugspur" step="1" value="${Number(o.offsetSeconds) || 0}"></label></details>`;
    const set = (query, action) =>
      (row.querySelector(query).onchange = (e) => {
        snapshot();
        action(e.target);
        changed();
      });
    set("input[type=checkbox]", (el) => {
      o.visible = el.checked;
    });
    set("input[type=color]", (el) => {
      o.color = el.value;
    });
    set(".overlay-name-tag", el => { o.showNameTag = el.checked; });
    set(".overlay-name", (el) => {
      o.name = el.value.slice(0, 100);
    });
    row.querySelector("select").value = o.alignment || "absolute";
    set("select", (el) => {
      o.alignment = el.value;
    });
    set("input[type=number]", (el) => {
      o.offsetSeconds = Number(el.value) || 0;
    });
    row.querySelector("button").onclick = () => {
      snapshot();
      S.flightOverlays.splice(index, 1);
      changed();
    };
    host.append(row);
  }
}
function flightThumbnail(flight, color) {
  const points = flight.points.filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 180)) === 0 || i === all.length - 1);
  if (!points.length) return "";
  const cos = Math.cos(points[0].lat * Math.PI / 180), origin = points[0].lon;
  const xy = points.map((p) => [(((p.lon - origin + 540) % 360) - 180) * cos, -p.lat]);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), dx = Math.max(...xs) - minX, dy = Math.max(...ys) - minY;
  const scale = Math.min(200 / Math.max(dx, .00001), 74 / Math.max(dy, .00001));
  const positions = xy.map(([x, y]) => `${(110 + (x - minX - dx / 2) * scale).toFixed(1)},${(47 + (y - minY - dy / 2) * scale).toFixed(1)}`);
  const last = positions.at(-1).split(",");
  return `<svg class="flight-thumbnail" viewBox="0 0 220 94" aria-hidden="true"><path d="M0 23.5H220M0 47H220M0 70.5H220M55 0V94M110 0V94M165 0V94" class="thumbnail-grid"/><polyline points="${positions.join(" ")}" fill="none" stroke="${esc(color)}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="4" fill="${esc(color)}"/></svg>`;
}
let renderedMapTime = null;
app.render = () => {
  if (!map) return false;
  Object.assign(app, effectScene(S.clips, S.tracks, app.time, S.layout));
  const fc = app.layers.find((c) => c.kind === "flight");
  let waiting = false;
  const mapFrameKey = `${app.time}:${app.canvas.width}:${app.canvas.height}:${fc?.id}`;
  if (fc && S.flight && (!renderJob || renderedMapTime !== mapFrameKey || !map.ready)) {
    const r = app.rects.get(fc.id);
    map.resize(app.canvas.width * r.w, app.canvas.height * r.h);
    map.heading = S.map.heading;
    map.pitch = S.map.pitch;
    map.range = S.map.range;
    map.update(
      S.flight.start + sourceTime(fc, app.time) * 1000,
      outputDuration(intervals, 0, app.time),
      {
        ...clipMapSettings(S.map, fc),
        frames: S.map.frames.map((f) => ({
          ...f,
          time: outputDuration(intervals, 0, f.time / 1000) * 1000,
        })),
      },
    );
    waiting = !map.ready;
    if (renderJob && !waiting) renderedMapTime = mapFrameKey;
  }
  const hold = engine.sync(
    S,
    app.time,
    app.playing,
    app.speed * playbackRateAt(intervals, app.time),
    app.exporting && (waiting || document.hidden || exporter.pending > 8),
  );
  if (hold) engine.pause();
  if (renderJob && (hold || waiting)) return true;
  drawFrame(app.canvas.getContext("2d"), {
    state: S,
    layers: app.layers,
    elements: engine.elements,
    map,
    rects: app.rects,
    transitions: app.transitions,
    time: app.time,
    flightClip: fc,
    language: renderJob ? S.uiLanguage || "de" : getLanguage(),
  });
  if (renderJob) return false;
  $("clock").textContent =
    format(viewTime(app.time)) + " / " + format(viewTime(duration()));
  $("auto-speed-status").textContent =
    playbackRateAt(intervals, app.time) > 1
      ? "Flug " + playbackRateAt(intervals, app.time) + "×"
      : "";
  $("play").textContent = app.playing ? "Ⅱ" : "▶";
  $("play").setAttribute("aria-label", app.playing ? "Pause" : "Abspielen");
  $("playhead").style.left = viewTime(app.time) * px + "px";
  $("terrain-status").textContent = fc ? map.terrainLabel : "";
  $("empty-stage").hidden = !!S.clips.length;
  renderHandles();
  return hold || (app.exporting && waiting);
};
function choose(id, multi = false, reveal = true) {
  closeSourcePreview();
  selectedInstrument = null;
  if (multi)
    selected = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
  else selected = [id];
  selectedAsset = null;
  if (reveal) showPanel("clip");
  renderInspector();
  renderSelection();
  handleKey = "";
}
function renderSelection() {
  $("zoom-selection").disabled = !selected.length;
  document
    .querySelectorAll(".clip")
    .forEach((el) =>
      el.classList.toggle("selected", selected.includes(el.dataset.id)),
    );
  $("selection-summary").textContent = selected.length
    ? selected.length === 1
      ? clipName(chosen()[0] || {})
      : t(selected.length + " Clips ausgewählt")
    : t("Clips greifen, schneiden und gestalten.");
}
function renderLibrary() {
  $("asset-count").textContent = S.assets.length;
  const search = $("media-search").value.toLowerCase(),
    assets = S.assets.filter(
      (a) =>
        (filter === "all" || a.type === filter) &&
        a.name.toLowerCase().includes(search),
    );
  $("asset-grid").replaceChildren();
  if (!assets.length)
    $("asset-grid").innerHTML =
      '<div class="library-empty">＋<br>Dein Material, an einem Ort.<br>Importieren oder Dateien hierher ziehen.</div>';
  for (const a of assets) {
    const item = document.createElement("div");
    item.className = "asset" + (a.id === selectedAsset ? " selected" : "");
    item.draggable = true;
    item.dataset.asset = a.id;
    item.innerHTML = `<button type="button" class="asset-select" draggable="true" title="${esc(a.name)}">` +
      (a.type === "audio"
        ? '<span class="audio-art">♫</span>'
        : `<img src="/thumb/${a.id}" alt="" loading="lazy" draggable="false">`) +
      `<strong translate="no">${esc(a.name)}</strong><small><span>${format(a.duration).split(".")[0]}</span><span>${S.clips.filter((c) => c.assetId === a.id).length}×</span></small></button>
      <button type="button" class="asset-preview" title="Quellvorschau öffnen" aria-label="Quellvorschau öffnen">▷</button>
      <button type="button" class="asset-add" title="In Timeline einsetzen" aria-label="In Timeline einsetzen">＋</button>`;
    const selectSource = () => {
      selectedInstrument = null;
      selectedAsset = a.id;
      selected = [];
      showPanel("clip");
      // Keep the card in the DOM so focus, double-click and dragging stay stable.
      document.querySelectorAll(".asset").forEach(el =>
        el.classList.toggle("selected", el.dataset.asset === a.id));
      renderInspector();
      renderSelection();
      handleKey = "";
    };
    const addSource = () => {
      snapshot();
      insertAsset(a);
      changed();
    };
    item.querySelector(".asset-select").onclick = selectSource;
    item.querySelector(".asset-select").ondblclick = addSource;
    item.querySelector(".asset-add").onclick = addSource;
    item.querySelector(".asset-preview").onclick = () => {
      selectSource();
      sourcePreview(a);
    };
    item.ondragstart = (e) => {
      e.dataTransfer.setData("application/x-flightstudio-asset", a.id);
      e.dataTransfer.effectAllowed = "copy";
    };
    $("asset-grid").append(item);
  }
  $("flight-info").textContent = S.flight
    ? `${S.flight.name} · ${(S.flight.distance / 1000).toFixed(1)} km · ${S.flight.points.length} GPS-Punkte`
    : "IGC · KML · KMZ – auch später ergänzen";
  $("export-kml").hidden = !S.flight;
  renderFlightOverlays();
}
function closeSourcePreview() {
  const dialog = $("source-preview");
  if (dialog.open) dialog.close();
  for (const kind of ["video", "audio", "photo"]) {
    const el = $("source-" + kind);
    el.pause?.();
    if (el.hasAttribute("src")) {
      el.removeAttribute("src");
      el.load?.();
    }
  }
}
function sourcePreview(a) {
  app.pause();
  $("source-name").textContent = a.name;
  for (const kind of ["video", "photo", "audio"]) {
    const el = $("source-" + kind);
    el.pause?.();
    el.hidden = kind !== a.type;
    if (kind === a.type) el.src = a.url;
  }
  $("source-preview").showModal();
}
function timelineSpan() { return Math.max(10, viewTime(duration()) + Math.min(5, viewTime(duration()) * .03)); }
function renderRuler() {
  const scroll = $("timeline-scroll"), steps = [1/30,.1,.25,.5,1,2,5,10,15,30,60,120,300,600,1800,3600];
  const step = steps.find(v => v * px >= 75) || 3600;
  const from = Math.max(0, Math.floor((scroll.scrollLeft - 100) / px / step) * step), to = Math.min(timelineSpan(), (scroll.scrollLeft + scroll.clientWidth + 100) / px);
  $("ruler").replaceChildren();
  for (let time = from; time <= to; time += step) {
    const tick = document.createElement('span'); tick.className = 'tick'; tick.style.left = time * px + 'px';
    tick.textContent = step < 1 ? format(time) : format(time).split('.')[0]; $("ruler").append(tick);
  }
}
function setTimelineZoom(value, anchorX = $("timeline-scroll").clientWidth / 2) {
  const scroll = $("timeline-scroll"), anchorTime = (scroll.scrollLeft + anchorX) / px;
  zoom = clamp(value, -1, 14); $("zoom").value = zoom; renderTimeline();
  scroll.scrollLeft = Math.max(0, anchorTime * px - anchorX); renderRuler();
}
function fitSelection() {
  const clips = chosen(); if (!clips.length) return;
  const scroll = $("timeline-scroll"), from = Math.min(...clips.map(c => viewTime(c.start))), to = Math.max(...clips.map(c => viewTime(end(c))));
  const base = Math.max(.02, (scroll.clientWidth - 25) / timelineSpan());
  setTimelineZoom(Math.log2(scroll.clientWidth * .85 / Math.max(.05, to - from) / base), 0);
  scroll.scrollLeft = Math.max(0, from * px - scroll.clientWidth * .075); renderRuler();
}
function clipEffectsDrag(event, clip, kind) {
  event.preventDefault(); event.stopPropagation(); choose(clip.id, false, false);
  if (trackFor(clip)?.locked) return;
  app.pause(); snapshot(); dragging = true;
  if (clip.kind !== 'audio' && kind !== 'volume') { clip.audioFadeIn ??= clip.fadeIn || 0; clip.audioFadeOut ??= clip.fadeOut || 0; }
  const x = event.clientX, y = event.clientY, volume = clip.volume ?? 1;
  const key = (clip.kind === 'audio' ? 'audioFade' : 'fade') + (kind === 'in' ? 'In' : 'Out'), original = clip[key] || 0;
  const edge = kind === 'in' ? clip.start : end(clip), view = viewTime(edge);
  const move = e => {
    if (kind === 'volume') clip.volume = clamp(volume + (y - e.clientY) / (e.shiftKey ? 500 : 50), 0, 2);
    else { const delta = editTime(view + (e.clientX - x) / px) - edge; clip[key] = clamp(original + (kind === 'in' ? delta : -delta), 0, length(clip)); }
    renderTimeline();
  };
  const done = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', done); document.removeEventListener('pointercancel', done); dragging = false; changed(); };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', done); document.addEventListener('pointercancel', done);
}
function renderTimeline() {
  const scroll = $("timeline-scroll"),
    span = Math.max(
      10,
      viewTime(duration()) + Math.min(5, viewTime(duration()) * 0.03),
    ),
    base = Math.max(0.02, (scroll.clientWidth - 25) / span);
  px = base * 2 ** zoom;
  const width = Math.max(scroll.clientWidth, span * px);
  $("timeline-content").style.width = width + "px";
  renderRuler();
  $("lanes").replaceChildren();
  $("track-labels").replaceChildren();
  for (const track of [...S.tracks].reverse()) {
    const label = document.createElement("div");
    label.className = "track-label";
    label.innerHTML = `<span class="track-grip" draggable="true" title="Spurreihenfolge ändern">⠿</span><input value="${esc(track.name)}" aria-label="Spurname"><button class="${track.visible ? "" : "off"}" title="Spur ein-/ausblenden">◉</button><button class="${track.muted ? "off" : ""}" title="Ton ein-/ausschalten">♫</button><button class="${track.locked ? "locked" : ""}" title="Spur sperren/entsperren">${track.locked ? "▣" : "▢"}</button>`;
    label.querySelector("input").onchange = (e) => {
      snapshot();
      track.name = e.target.value || "Spur";
      changed();
    };
    const buttons = label.querySelectorAll("button");
    ["visible", "muted", "locked"].forEach(
      (key, i) =>
        (buttons[i].onclick = () => {
          snapshot();
          track[key] = !track[key];
          changed();
        }),
    );
    const remove = document.createElement("button");
    remove.className = "track-remove";
    remove.textContent = "×";
    remove.title = "Spur mit allen Clips entfernen · Rückgängig mit Strg+Z";
    remove.setAttribute("aria-label", "Spur entfernen");
    remove.disabled = !!track.locked;
    remove.onclick = () => {
      app.pause();
      snapshot();
      removeTrack(S, track.id);
      changed();
      app.toast("Spur entfernt. Mit Strg+Z wiederherstellen. Medien bleiben in der Mediathek.");
    };
    label.append(remove);
    label.querySelector(".track-grip").ondragstart = (e) =>
      e.dataTransfer.setData("application/x-flightstudio-track", track.id);
    label.ondragover = (e) => e.preventDefault();
    label.ondrop = (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("application/x-flightstudio-track"),
        from = S.tracks.findIndex((t) => t.id === id),
        to = S.tracks.indexOf(track);
      if (from >= 0 && from !== to) {
        snapshot();
        S.tracks.splice(to, 0, ...S.tracks.splice(from, 1));
        changed();
      }
    };
    $("track-labels").append(label);
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.dataset.track = track.id;
    lane.ondragover = (e) => {
      e.preventDefault();
      lane.classList.add("drop-target");
    };
    lane.ondragleave = () => lane.classList.remove("drop-target");
    lane.ondrop = (e) => {
      e.preventDefault();
      lane.classList.remove("drop-target");
      const asset = S.assets.find(
        (a) =>
          a.id === e.dataTransfer.getData("application/x-flightstudio-asset"),
      );
      if (!asset) return;
      if (track.locked) {
        app.toast("Diese Spur ist gesperrt.");
        return;
      }
      const kind = asset.type === "audio" ? "audio" : "video";
      if (track.kind !== kind) {
        app.toast("Video/Fotos und Audio benötigen passende Spuren.");
        return;
      }
      snapshot();
      insertAsset(
        asset,
        Math.max(
          0,
          editTime((e.clientX - lane.getBoundingClientRect().left) / px),
        ),
        track.id,
      );
      changed();
    };
    lane.onpointerdown = (e) => {
      if (e.target === lane) {
        selected = [];
        renderInspector();
        app.seek(
          editTime((e.clientX - lane.getBoundingClientRect().left) / px),
        );
        renderSelection();
      }
    };
    for (const c of S.clips.filter((c) => c.trackId === track.id)) {
      const el = document.createElement("div");
      el.className = `clip ${c.kind} ${selected.includes(c.id) ? "selected" : ""} ${track.locked ? "locked" : ""} ${c.enabled === false ? "disabled-clip" : ""}`;
      el.dataset.id = c.id;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        `${clipName(c)} · Start ${c.start.toFixed(2)} s · ${length(c).toFixed(2)} s`,
      );
      el.style.left = viewTime(c.start) * px + "px";
      el.style.width =
        Math.max(3, (viewTime(end(c)) - viewTime(c.start)) * px) + "px";
      el.innerHTML = `<span class="trim left"></span><span class="clip-name" translate="no">${esc(clipName(c))}</span><span class="clip-info">${c.rate}× · ${format(length(c)).split(".")[0]}${c.auto ? " · Zeitstempel" : ""}</span><span class="trim right"></span>`;
      if (["video", "audio"].includes(c.kind)) {
        el.querySelector('.clip-info').append(' · ' + (c.muted ? '0' : Math.round((c.volume ?? 1) * 100)) + '%');
        const gain = document.createElement('span'); gain.className = 'clip-gain'; gain.title = 'Lautstärke ziehen · Umschalt für Feinabstimmung';
        gain.onpointerdown = e => clipEffectsDrag(e, c, 'volume'); el.append(gain);
      }
      for (const [side, value] of [['in', c.kind === 'audio' ? c.audioFadeIn ?? c.fadeIn : c.fadeIn], ['out', c.kind === 'audio' ? c.audioFadeOut ?? c.fadeOut : c.fadeOut]]) {
        const band = document.createElement('span'); band.className = 'fade-band ' + side;
        band.style.width = Math.max(0, (side === 'in' ? viewTime(c.start + (value || 0)) - viewTime(c.start) : viewTime(end(c)) - viewTime(end(c) - (value || 0))) * px) + 'px'; el.append(band);
        const grip = document.createElement('span'); grip.className = 'fade-grip ' + side; grip.title = side === 'in' ? 'Einblendegriff ziehen' : 'Ausblendegriff ziehen';
        grip.onpointerdown = e => clipEffectsDrag(e, c, side); el.append(grip);
      }
      el.onpointerdown = (e) => clipDrag(e, c);
      el.ondblclick = () => {
        app.seek(c.start);
        choose(c.id);
      };
      el.onkeydown = (e) => {
        if (e.key === "Enter") choose(c.id);
      };
      lane.append(el);
    }
    for (const c of S.clips.filter(c => c.trackId === track.id)) {
      const tr = transitionFor(S.clips, c); if (!tr) continue;
      const badge = document.createElement('button'); badge.className = 'transition-band'; badge.title = tr.type === 'wipe' ? 'Wischblende bearbeiten' : 'Überblendung bearbeiten';
      badge.style.left = viewTime(tr.start) * px + 'px'; badge.style.width = Math.max(12, (viewTime(tr.end) - viewTime(tr.start)) * px) + 'px'; badge.textContent = tr.type === 'wipe' ? '↦' : '⋈';
      badge.onclick = () => { choose(c.id); app.seek(tr.start + tr.duration / 2); }; lane.append(badge);
    }
    $("lanes").append(lane);
  }
  for (const c of S.clips.filter((c) => c.kind === "flight"))
    for (const s of intervals) {
      const a = Math.max(s.start, c.start),
        b = Math.min(s.end, end(c));
      if (s.rate <= 1 || b <= a) continue;
      const band = document.createElement("div");
      band.className = "auto-gap";
      band.style.left = (viewTime(a) - viewTime(c.start)) * px + "px";
      band.style.width = (viewTime(b) - viewTime(a)) * px + "px";
      band.textContent = s.rate + "× automatisch";
      document.querySelector(`.clip[data-id="${c.id}"]`)?.append(band);
    }
  renderRange();
  $("track-labels").style.transform = `translateY(${-scroll.scrollTop}px)`;
}
function clipDrag(e, c) {
  if (e.button !== 0) return;
  e.preventDefault();
  if (!selected.includes(c.id) || e.ctrlKey || e.metaKey)
    choose(c.id, e.ctrlKey || e.metaKey);
  if (trackFor(c).locked) return;
  app.pause();
  const side = e.target.closest(".trim")
      ? e.target.classList.contains("left")
        ? "left"
        : "right"
      : null,
    originals = editableChosen().map((x) => ({ ...x })),
    x = e.clientX,
    scrollStart = $("timeline-scroll").scrollLeft,
    originalPointer =
      (e.clientX - $("timeline-content").getBoundingClientRect().left) / px;
  let moved = false;
  snapshot();
  dragging = true;
  const move = (event) => {
    let delta =
      editTime(
        originalPointer +
          (event.clientX - x + $("timeline-scroll").scrollLeft - scrollStart) /
            px,
      ) - editTime(originalPointer);
    if (Math.abs(event.clientX - x) > 2) moved = true;
    if (!moved) return;
    if (side) {
      const old = originals.find((v) => v.id === c.id);
      if (!old) return;
      if (side === "left") {
        delta = clamp(delta, -old.in / old.rate, length(old) - 0.05);
        delta = Math.max(delta, -old.start);
        c.start = old.start + delta;
        c.in = old.in + delta * old.rate;
      } else {
        const max =
          c.kind === "flight"
            ? (S.flight.end - S.flight.start) / 1000
            : c.kind === "title" || c.kind === "photo"
              ? 3600
              : assetFor(c).duration;
        c.out = clamp(
          old.out + delta * old.rate,
          old.in + 0.05 * old.rate,
          max,
        );
        if (c.kind === "photo" && c.out > assetFor(c).duration)
          assetFor(c).duration = c.out;
      }
    } else {
      const min = Math.min(...originals.map((o) => o.start));
      delta = Math.max(delta, -min);
      if (snapping && !event.altKey) {
        const base = originals.find((o) => o.id === c.id);
        delta =
          snapTime(
            base.start + delta,
            S.clips,
            selected,
            app.time,
            Math.max(
              0.001,
              editTime(viewTime(base.start) + 8 / px) - base.start,
            ),
          ) - base.start;
        delta = Math.max(delta, -min);
      }
      for (const original of originals) {
        const current = S.clips.find((v) => v.id === original.id);
        current.start = original.start + delta;
        current.auto = false;
      }
      const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest(".lane"),
        track = target && S.tracks.find((t) => t.id === target.dataset.track);
      if (
        track &&
        !track.locked &&
        originals.length === 1 &&
        track.kind === trackFor(c).kind
      )
        c.trackId = track.id;
    }
    c.auto = false;
    for (const current of editableChosen()) {
      const el = document.querySelector(`.clip[data-id="${current.id}"]`);
      if (el) {
        el.style.left = viewTime(current.start) * px + "px";
        el.style.width =
          Math.max(3, (viewTime(end(current)) - viewTime(current.start)) * px) +
          "px";
        const lane = document.querySelector(
          `.lane[data-track="${current.trackId}"]`,
        );
        if (lane && el.parentElement !== lane) lane.append(el);
      }
    }
    const sc = $("timeline-scroll"),
      r = sc.getBoundingClientRect();
    if (event.clientX > r.right - 30) sc.scrollLeft += 12;
    if (event.clientX < r.left + 30) sc.scrollLeft -= 12;
  };
  const finish = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", finish);
    dragging = false;
    if (moved && !side && originals.length === 1) Object.assign(c, connectOverlap(S.clips, c));
    if (!moved) {
      history.pop();
      app.seek(c.start);
    }
    changed();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", finish);
}
function renderRange() {
  if (document.activeElement !== $("range-start"))
    $("range-start").value = viewTime(app.range[0]).toFixed(2);
  if (document.activeElement !== $("range-end"))
    $("range-end").value = viewTime(app.range[1]).toFixed(2);
  $("range-shade").style.left = viewTime(app.range[0]) * px + "px";
  $("range-shade").style.width =
    Math.max(0, viewTime(app.range[1]) - viewTime(app.range[0])) * px + "px";
  $("duration-label").textContent =
    `Film ca. ${format(outputDuration(intervals)).split(".")[0]} · Timeline ${format(duration()).split(".")[0]} · ${S.clips.length} Clips`;
}
function readRange() {
  app.range = [
    clamp(editTime(Number($("range-start").value) || 0), 0, duration()),
    clamp(editTime(Number($("range-end").value) || 0), 0, duration()),
  ];
  rangeAuto = false;
  renderRange();
}
function renderHandles() {
  const widgets = S.instrumentsVisible === false ? [] : (S.instruments || []).filter(i => i.enabled !== false);
  const fc = app.layers.find((c) => c.kind === "flight" && c.showStats !== false);
  const key =
    app.layers.map((c) => c.id + clipName(c)).join(",") +
    "|" +
    selected.join(",") +
    "|" +
    arrange + "|" + (fc?.id || "") + "|" + widgets.map(i => i.id).join(",") + "|" + selectedInstrument;
  if (key !== handleKey) {
    handleKey = key;
    $("handles").replaceChildren();
    for (const c of app.layers) {
      const el = document.createElement("div");
      el.className = `window-handle ${c.kind} ${selected.includes(c.id) ? "selected" : ""}`;
      el.dataset.id = c.id;
      el.setAttribute("aria-label", "Bildposition " + clipName(c));
      el.innerHTML = `<span class="caption" translate="no">${esc(clipName(c))}</span><span class="scale"></span>`;
      el.onpointerdown = (e) => windowDrag(e, c);
      el.oncontextmenu = (e) => { if (c.kind === "flight") e.preventDefault(); };
      $("handles").append(el);
    }
    if (fc) {
      const el = document.createElement("div");
      el.className = "window-handle stats-handle";
      el.dataset.stats = fc.id;
      el.setAttribute("aria-label", "Flugdaten verschieben oder vergrössern");
      el.innerHTML = '<span class="caption">Flugdaten</span><span class="scale"></span>';
      el.onpointerdown = (e) => statsDrag(e, fc);
      $("handles").append(el);
    }
  }
  for (const item of widgets) {
    if (![...$("handles").children].some(el => el.dataset.instrument === item.id)) {
      const el = document.createElement("div");
      el.className = "window-handle instrument-handle" + (selectedInstrument === item.id ? " selected" : "");
      el.dataset.instrument = item.id; el.tabIndex = 0; el.setAttribute("role", "button");
      const name = instrumentReading(S, item, app.time, getLanguage()).label;
      el.setAttribute("aria-label", (getLanguage() === "en" ? "Move instrument: " : "Instrument verschieben: ") + name);
      el.innerHTML = `<span class="caption" translate="no">${esc(name)}</span><span class="scale"></span>`;
      el.onpointerdown = e => instrumentDrag(e, item);
      el.ondblclick = () => selectInstrument(item.id);
      el.onkeydown = e => { if (e.key === "Enter") { e.stopPropagation(); selectInstrument(item.id); } };
      $("handles").append(el);
    }
  }
  for (const el of $("handles").children) {
    const widget = widgets.find(i => i.id === el.dataset.instrument);
    const r = widget ? instrumentRect(widget.rect) : el.dataset.stats ? readoutRect(fc, map.readouts?.length || 1) : app.rects.get(el.dataset.id);
    if (r) {
      el.style.left = r.x * 100 + "%";
      el.style.top = r.y * 100 + "%";
      el.style.width = r.w * 100 + "%";
      el.style.height = r.h * 100 + "%";
    }
  }
  $("stage").classList.toggle("map-interaction", !arrange);
}
function instrumentDrag(e, item) {
  if (!arrange || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation(); app.pause(); snapshot();
  selectedInstrument = item.id; selected = []; handleKey = ""; renderSelection();
  if (activePanel === "instruments") instrumentPanel?.render();
  dragging = true;
  const start = instrumentRect(item.rect), bounds = $("stage").getBoundingClientRect();
  const x = e.clientX, y = e.clientY, resize = e.target.classList.contains("scale");
  const move = event => {
    const dx = (event.clientX - x) / bounds.width, dy = (event.clientY - y) / bounds.height;
    item.rect = instrumentRect(resize ? { ...start, w: start.w + dx, h: start.h + dy } : { ...start, x: start.x + dx, y: start.y + dy });
  };
  const finish = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", finish); document.removeEventListener("pointercancel", finish); dragging = false; changed(); };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", finish); document.addEventListener("pointercancel", finish);
}
function statsDrag(e, clip) {
  if (!arrange || e.button !== 0 || trackFor(clip)?.locked) return;
  e.preventDefault(); e.stopPropagation(); app.pause(); snapshot();
  dragging = true;
  const start = { ...readoutRect(clip, map.readouts?.length || 1) }, bounds = $("stage").getBoundingClientRect();
  const x = e.clientX, y = e.clientY, resize = e.target.classList.contains("scale");
  const move = (event) => {
    const dx = (event.clientX - x) / bounds.width, dy = (event.clientY - y) / bounds.height;
    clip.statsRect = normalizedRect(resize ? { ...start, w: start.w + dx, h: start.h + dy } : { ...start, x: start.x + dx, y: start.y + dy });
  };
  const finish = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", finish);
    dragging = false; changed();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", finish);
}
function windowDrag(e, c) {
  const cameraDrag = c.kind === "flight" && (!arrange || e.button === 2 || e.shiftKey);
  if ((!cameraDrag && e.button !== 0) || trackFor(c)?.locked || (cameraDrag && ![0, 1, 2].includes(e.button))) return;
  e.preventDefault();
  app.pause();
  choose(c.id, false, false);
  snapshot();
  dragging = true;
  const initial = { ...app.rects.get(c.id) },
    bounds = $("stage").getBoundingClientRect(),
    x = e.clientX,
    y = e.clientY,
    scale = e.target.classList.contains("scale"),
    imagePan = !cameraDrag && e.altKey && ["video", "photo"].includes(c.kind),
    imageStart = imageTransform(c.imageTransform),
    gesture = cameraDrag ? map.gesture() : null,
    pan = e.button === 1 || e.button === 2 || e.shiftKey,
    follow = S.map.camera === "follow" && !pan;
  if (gesture && follow) Object.assign(gesture, { heading: S.map.heading, pitch: S.map.pitch, range: S.map.range });
  const move = (event) => {
    const dx = (event.clientX - x) / bounds.width,
      dy = (event.clientY - y) / bounds.height;
    if (cameraDrag) {
      map.moveGesture(gesture, dx / initial.w, dy / initial.h, pan);
      S.map.heading = map.heading;
      S.map.pitch = map.pitch;
      S.map.range = map.range;
      S.map.camera = follow ? "follow" : "fixed";
      S.viewPose = map.pose();
    } else if (imagePan) {
      c.imageTransform = imageTransform({ ...imageStart, x: imageStart.x + dx / initial.w, y: imageStart.y + dy / initial.h });
    } else
      c.rect = normalizedRect(
        scale
          ? { ...initial, w: initial.w + dx, h: initial.h + dy }
          : { ...initial, x: initial.x + dx, y: initial.y + dy },
      );
  };
  const finish = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", finish);
    dragging = false;
    changed();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", finish);
}
function field(label, id, value, type = "number", extra = "") {
  return `<label>${label}<input id="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function renderInspector() {
  const host = $("inspector-content"),
    clips = chosen(),
    c = clips[0],
    asset = selectedAsset
      ? S.assets.find((a) => a.id === selectedAsset)
      : c && assetFor(c);
  $("inspector-kind").textContent =
    clips.length > 1
      ? "MEHRFACHAUSWAHL"
      : c
        ? c.kind.toUpperCase()
        : asset
          ? "QUELLMEDIUM"
          : "PROJEKT";
  if (!c) {
    if (!asset) {
      host.innerHTML =
        '<div class="inspector-empty"><b>⌁</b>Wähle einen Clip auf der Timeline.<br>Position, Tempo, Bild und Ton findest du hier.</div>';
      return;
    }
    host.innerHTML = `<h3 translate="no">${esc(asset.name)}</h3><p class="status-chip">${asset.width || "Audio"}${asset.height ? " × " + asset.height : ""} · ${format(asset.duration)}<br>${esc(asset.capture?.raw || "Kein Aufnahmezeitstempel")}</p>${field("Name in der Mediathek", "asset-name", asset.name, "text")}<button id="asset-remove">Aus Mediathek entfernen</button><p class="hint">Originaldatei bleibt erhalten. Verwendete Medien zuerst aus der Timeline entfernen.</p>`;
    $("asset-name").onchange = (e) => {
      snapshot();
      asset.name = e.target.value;
      changed();
    };
    $("asset-remove").onclick = () => {
      if (S.clips.some((c) => c.assetId === asset.id)) {
        app.toast("Dieses Medium ist noch auf der Timeline.");
        return;
      }
      snapshot();
      S.assets = S.assets.filter((a) => a !== asset);
      selectedAsset = null;
      changed();
    };
    return;
  }
  if (clips.length > 1) {
    host.innerHTML = `<h3>${clips.length} Clips ausgewählt</h3><p class="hint">Gemeinsam ziehen, teilen, duplizieren oder entfernen. Für einzelne Eigenschaften einen Clip auswählen.</p>`;
    return;
  }
  const rect = c.rect || effectScene(S.clips, S.tracks, active(c, app.time) ? app.time : c.start, S.layout).rects.get(c.id) || { x: 0, y: 0, w: 1, h: 1 },
    locked = trackFor(c)?.locked;
  host.innerHTML = `<h3 translate="no">${esc(clipName(c))}</h3><p class="status-chip ${c.auto ? "" : "warning"}">${locked ? "Spur gesperrt. Zum Bearbeiten entsperren." : c.auto ? "Über Aufnahmezeit zugeordnet. Weiterhin frei verschiebbar." : "Position auf der Schnitt-Timeline frei bearbeitbar."}</p><div class="two-fields">${field("Start auf Timeline (s)", "clip-start", viewTime(c.start).toFixed(3), "number", 'min="0" step=".01"')}${field(c.kind === "flight" ? "Dauer vor Automatik (s)" : "Dauer (s)", "clip-length", length(c).toFixed(3), "number", 'min=".05" step=".01"')}</div><div class="two-fields">${field("Quell-Anfang (s)", "clip-in", c.in.toFixed(3), "number", 'min="0" step=".01"')}${field("Quell-Ende (s)", "clip-out", c.out.toFixed(3), "number", 'min=".05" step=".01"')}</div><label>Clip-Tempo<select id="clip-rate">${[0.1, 0.25, 0.5, 1, 2, 4, 5, 10, 20, 50, 100, 150, 200, ...(![0.1, 0.25, 0.5, 1, 2, 4, 5, 10, 20, 50, 100, 150, 200].includes(c.rate) ? [c.rate] : [])].map((n) => `<option value="${n}" ${n === c.rate ? "selected" : ""}>${n}×</option>`).join("")}</select></label>`;
  const bind = (id, action) => {
    $(id).onchange = safe((e) => {
      if (locked) {
        renderInspector();
        return;
      }
      snapshot();
      action(e.target.value);
      c.auto = false;
      changed();
    });
  };
  const maxSource = () =>
    c.kind === "flight"
      ? (S.flight.end - S.flight.start) / 1000
      : ["title", "photo"].includes(c.kind)
        ? 3600
        : asset.duration;
  bind("clip-start", (v) => (c.start = Math.max(0, editTime(Number(v) || 0))));
  bind(
    "clip-in",
    (v) => (c.in = clamp(Number(v) || 0, 0, c.out - 0.05 * c.rate)),
  );
  bind("clip-out", (v) => {
    c.out = clamp(Number(v) || c.out, c.in + 0.05 * c.rate, maxSource());
    if (c.kind === "photo") asset.duration = Math.max(asset.duration, c.out);
  });
  bind("clip-length", (v) => {
    c.out = clamp(
      c.in + (Number(v) || 0.05) * c.rate,
      c.in + 0.05 * c.rate,
      maxSource(),
    );
    if (c.kind === "photo") asset.duration = Math.max(asset.duration, c.out);
  });
  bind("clip-rate", (v) => {
    c.rate = Number(v);
    c.manualSpeed = true;
  });
  renderClipEffects({ host, clip: c, state: S, rect, locked, field, snapshot, changed, render: () => app.render() });
  if (c.kind === "title") {
    host.insertAdjacentHTML(
      "beforeend",
      `<label>Titeltext<textarea id="title-text">${esc(c.text)}</textarea></label><div class="two-fields">${field("Schriftgrösse", "title-size", c.fontSize || 54, "number", 'min="10" max="200"')}${field("Farbe", "title-color", c.color || "#ffffff", "color")}</div>`,
    );
    bind("title-text", (v) => (c.text = v));
    bind("title-size", (v) => (c.fontSize = clamp(Number(v), 10, 200)));
    bind("title-color", (v) => (c.color = v));
  }
  if (c.kind === "flight") {
    const dataRect = readoutRect(c, 1 + (S.flightOverlays || []).filter((o) => o.visible !== false).length);
    host.insertAdjacentHTML(
      "beforeend",
      `<div class="clip-map-settings"><strong>Karte in diesem Abschnitt</strong><label>Layout in diesem Flugclip<select id="clip-layout"><option value="inherit">Projektstandard verwenden</option><option value="grid">Raster · Karte neben Videos</option><option value="pip">Video gross · Karte im Bild</option><option value="map-main">Flug gross · Videos im Bild</option><option value="stack">Untereinander</option><option value="auto">Automatisch</option></select></label><p class="hint">Gilt nur während dieses Flugclips. Für einen Teilbereich zuerst mit S teilen. Eigene Bildpositionen haben Vorrang.</p><label>Kartenstil<select id="clip-map-style"><option value="inherit">Projektstandard verwenden</option><option value="satellite">Satellit · 3D</option><option value="osm">Strassenkarte · 3D</option><option value="relief">Schwarzweiss · Relief</option><option value="overlay">Transparent · Relief-Overlay</option></select></label><label>Relief-Deckkraft (%)<input id="clip-map-opacity" type="number" min="0" max="100" value="${Math.round((c.mapOpacity ?? S.map.opacity) * 100)}"></label><p class="hint">Flugspur mit S teilen, dann den Kartenstil je Abschnitt wählen. Gilt auch im Export.</p></div>`,
    );
    $("clip-layout").value = c.layout || "inherit";
    bind("clip-layout", (value) => { c.layout = value; c.rect = null; });
    $("clip-map-style").value = c.mapStyle || "inherit";
    host
      .querySelector(".status-chip")
      .after(host.querySelector(".clip-map-settings"));
    bind("clip-map-style", (v) => {
      c.mapStyle = v;
    });
    bind("clip-map-opacity", (v) => {
      c.mapOpacity = clamp(Number(v) / 100, 0, 1);
    });
    host.insertAdjacentHTML(
      "beforeend",
      `<details open><summary>Flugdaten · Position</summary><label class="check"><input id="flight-stats" type="checkbox" ${c.showStats !== false ? "checked" : ""}> Flugdaten einblenden</label><p class="hint">Jede Flugspur hat eine eigene Zeile mit Farbpunkt. Im Modus Fensterposition direkt im Bild verschieben und an der Ecke vergrössern.</p><div class="two-fields">${field("Links (%)", "stats-x", (dataRect.x * 100).toFixed(1), "number", 'step=".5"')}${field("Oben (%)", "stats-y", (dataRect.y * 100).toFixed(1), "number", 'step=".5"')}${field("Breite (%)", "stats-w", (dataRect.w * 100).toFixed(1), "number", 'min="4" max="100" step=".5"')}${field("Höhe (%)", "stats-h", (dataRect.h * 100).toFixed(1), "number", 'min="4" max="100" step=".5"')}</div><button id="stats-reset">Flugdaten oben links zurücksetzen</button></details><label class="check"><input id="flight-auto-speed" type="checkbox" ${!c.manualSpeed ? "checked" : ""}> Automatik für freie Abschnitte</label>`,
    );
    for (const key of ["x", "y", "w", "h"])
      bind("stats-" + key, (v) => (c.statsRect = normalizedRect({ ...dataRect, [key]: Number(v) / 100 })));
    $("stats-reset").onclick = () => { if (locked) return; snapshot(); c.statsRect = null; changed(); };
    $("flight-auto-speed").onchange = (e) => {
      snapshot();
      c.manualSpeed = !e.target.checked;
      changed();
    };
    $("flight-stats").onchange = (e) => {
      snapshot();
      c.showStats = e.target.checked;
      changed();
    };
  }
  if (asset) {
    const stamp = c.captureOverride ?? capture(asset);
    host.insertAdjacentHTML(
      "beforeend",
      `<details><summary>Aufnahmezeit & Synchronisation</summary><p class="hint">${esc(asset.capture?.source || "Kein Zeitstempel erkannt")}<br>${esc(asset.capture?.raw || "Aufnahmebeginn manuell zuordnen.")}</p>${field("Beginn der Originalaufnahme", "capture-time", stamp !== null ? DateTime.fromMillis(stamp).setZone(S.zone).toFormat("yyyy-MM-dd'T'HH:mm:ss") : "", "datetime-local", 'step="1"')}<button id="resync">Anhand Aufnahmezeit zuordnen</button><p class="hint">Zeitzone: ${esc(S.zone)}. Bereits entfernte Abschnitte oder Tempoänderungen in Insta360 sind nicht automatisch erkennbar.</p></details>`,
    );
    bind("capture-time", (v) => {
      const time = parseCaptureTime(v, S.zone);
      if (time === null) throw new Error("Ungültige Aufnahmezeit.");
      c.captureOverride = time;
    });
    $("resync").onclick = safe(() => resync(c));
  }
  host
    .querySelectorAll("input,select,textarea,button")
    .forEach((el) => (el.disabled ||= !!locked));
}
function resync(c) {
  const a = assetFor(c),
    stamp = c.captureOverride ?? capture(a);
  if (!S.flight || stamp === null)
    throw new Error(
      "Bitte eine Flugspur und einen gültigen Aufnahmebeginn angeben.",
    );
  const pieces = timedClips(
    { ...a, duration: c.out - c.in },
    stamp + c.in * 1000,
    S.flight,
    S.clips.filter((f) => f.kind === "flight"),
    c.trackId,
  );
  if (!pieces.length)
    throw new Error(
      "Diese Aufnahmezeit liegt ausserhalb der vorhandenen Flugabschnitte.",
    );
  snapshot();
  S.clips = S.clips.filter((v) => v.id !== c.id);
  for (const p of pieces)
    S.clips.push({
      ...c,
      id: p.id,
      start: p.start,
      in: c.in + p.in,
      out: c.in + p.out,
      rate: p.rate,
      auto: true,
    });
  selected = pieces.map((p) => p.id);
  app.time = pieces[0].start;
  changed();
}
function renderCameras() {
  const list = $("camera-list");
  list.replaceChildren();
  S.map.frames.forEach((f, i) => {
    const el = document.createElement("div");
    el.className = "camera-point";
    el.innerHTML = `<button>${i + 1}. ${format(viewTime(f.time / 1000))} · ${f.duration}s</button><button aria-label="Kamerapunkt entfernen">×</button>`;
    el.children[0].onclick = () => {
      S.map.camera = "path";
      app.seek(advancePlayback(intervals, f.time / 1000, f.duration));
      refresh();
    };
    el.children[1].onclick = () => {
      snapshot();
      S.map.frames.splice(i, 1);
      changed();
    };
    list.append(el);
  });
}
function refresh() {
  if (activePanel === "instruments") instrumentPanel?.render();
  $("timeline-mode").value = compact ? "film" : "edit";
  $("gap-auto").checked = S.gaps.enabled;
  $("gap-speed").value = S.gaps.speed;
  $("gap-50").classList.toggle("active", S.gaps.enabled && S.gaps.speed === 50);
  $("gap-description").textContent = S.gaps.enabled
    ? `Ein · freie Flugabschnitte ${S.gaps.speed}×`
    : "Aus · alle Abschnitte in ihrem eingestellten Tempo";
  $("project-name").value = S.name;
  $("project-name-settings").value = S.name;
  $("aspect").value = S.aspect;
  $("layout").value = S.layout;
  $("timezone").value = S.zone;
  $("background").value = S.background;
  $("map-style").value = S.map.style;
  $("relief-opacity").value = S.map.opacity * 100;
  $("camera-mode").value = S.map.camera;
  $("camera-heading").value =
    ((((S.map.heading * 180) / Math.PI) % 360) + 360) % 360;
  $("camera-pitch").value = (-S.map.pitch * 180) / Math.PI;
  $("camera-range").value = S.map.range;
  cameraLabels();
  $("undo").disabled = !history.length;
  $("redo").disabled = !future.length;
  renderLibrary();
  renderTimeline();
  app.render();
  renderInspector();
  renderCameras();
  renderSelection();
  fitStage();
}
function cameraLabels() {
  $("heading-label").textContent =
    Math.round(Number($("camera-heading").value)) + "°";
  $("pitch-label").textContent =
    Math.round(Number($("camera-pitch").value)) + "°";
  $("range-label").textContent = $("camera-range").value + " m";
}
function download(content, name, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function restore(data) {
  app.pause();
  const assets = await app.api("/api/media");
  if (data.version === 1) data = convertV1(data, assets, fresh);
  validateProject(data);
  const missing = [];
  data.assets = data.assets.flatMap((a) => {
    const local =
      assets.find((x) => x.id === a.id) ||
      assets.find(
        (x) =>
          (x.name === (a.originalName || a.name) || x.name === a.name) &&
          (x.type === "photo" || Math.abs(x.duration - a.duration) < 0.1),
      );
    if (!local) {
      missing.push(a.id);
      return [];
    }
    for (const c of data.clips) if (c.assetId === a.id) c.assetId = local.id;
    return {
      ...local,
      name: a.name,
      originalName: a.originalName || local.name,
      duration:
        local.type === "photo"
          ? Math.max(local.duration, a.duration)
          : local.duration,
    };
  });
  data.clips = data.clips.filter((c) => !missing.includes(c.assetId));
  S = { ...fresh(), ...data, map: { ...fresh().map, ...data.map } };
  selected = [];
  selectedAsset = null;
  S.gaps = { ...fresh().gaps, ...data.gaps };
  if (!data.gaps?.explicit) S.gaps.enabled = false;
  S.gaps.explicit = true;
  app.time = Number(data.playhead) || 0;
  history.length = 0;
  future.length = 0;
  rangeAuto = true;
  if (S.flight) {
    S.flight = finalizeFlight(S.flight.points, S.flight.name, {
      ...S.flight,
      format: S.flight.format,
      pilot: S.flight.pilot,
      displayName: S.flight.displayName,
      showNameTag: S.flight.showNameTag,
    });
    map.load(S.flight);
  }
  S.flightOverlays = (data.flightOverlays || []).map((o) => ({
    ...o,
    flight: finalizeFlight(o.flight.points, o.flight.name, {
      ...o.flight,
      format: o.flight.format,
      pilot: o.flight.pilot,
    }),
  }));
  if (S.viewPose && S.map.camera === "fixed") map.apply(S.viewPose);
  app.size();
  changed();
  if (missing.length)
    app.toast(
      `${missing.length} Medien fehlen. Originale in V2 importieren, danach dieses Projekt erneut öffnen.`,
      true,
    );
}

function splitSelected() {
  const ids = selected.length
    ? editableChosen().map((c) => c.id)
    : S.clips
        .filter((c) => active(c, app.time) && !trackFor(c).locked)
        .map((c) => c.id);
  snapshot();
  S.clips = S.clips.flatMap((c) =>
    ids.includes(c.id) ? splitClip(c, app.time) : [c],
  );
  changed();
}
function removeSelected() {
  if (!editableChosen().length) return;
  snapshot();
  const ids = editableChosen().map((c) => c.id);
  S.clips = S.clips.filter((c) => !ids.includes(c.id));
  selected = [];
  changed();
}
function duplicateSelected() {
  const clips = editableChosen();
  if (!clips.length) return;
  snapshot();
  const copies = clips.map((c) => ({
    ...c,
    id: uid(),
    start: end(c),
    auto: false,
  }));
  S.clips.push(...copies);
  selected = copies.map((c) => c.id);
  changed();
}
function rangeEdit(rate = null) {
  readRange();
  if (app.range[1] - app.range[0] < 0.02)
    throw new Error("Bitte Anfang und Ende des Bereichs wählen.");
  const all = $("edit-scope").value === "all";
  if (
    all &&
    S.tracks.some((t) => t.locked && S.clips.some((c) => c.trackId === t.id))
  )
    throw new Error(
      "Für einen gemeinsamen Schnitt bitte gesperrte Spuren entsperren.",
    );
  if (!all && !editableChosen().length)
    throw new Error("Bitte mindestens einen Clip auswählen.");
  snapshot();
  const [a, b] = app.range;
  S.clips = editRange(S.clips, a, b, rate, {
    ripple: all,
    ids: all ? null : editableChosen().map((c) => c.id),
  });
  if (all) {
    const transform = (t) =>
      t <= a
        ? t
        : t >= b
          ? t + (rate === null ? -(b - a) : (b - a) / rate - (b - a))
          : rate === null
            ? a
            : a + (t - a) / rate;
    S.map.frames = S.map.frames
      .filter((f) => rate !== null || f.time / 1000 < a || f.time / 1000 >= b)
      .map((f) => ({
        ...f,
        time: transform(f.time / 1000) * 1000,
        duration: f.duration,
      }));
    app.time = transform(app.time);
  }
  rangeAuto = true;
  changed();
}
function wire() {
  for (const name of ["media", "flights"])
    $("gallery-" + name).onclick = () => showGallery(activeGallery === name ? null : name);
  $("gallery-close").onclick = () => showGallery(null);
  for (const name of ["clip", "camera", "instruments", "project"])
    $("panel-" + name).onclick = () => showPanel(activePanel === name ? null : name);
  $("panel-close").onclick = () => showPanel(null);
  $("import-media").onclick = $("empty-import").onclick = () =>
    $("media-input").click();
  $("media-input").onchange = safe(async (e) => {
    await importFiles([...e.target.files]);
    e.target.value = "";
  });
  $("import-flight").onclick = () => {
    replaceFlightNext = false;
    $("flight-input").click();
  };
  $("replace-flight").onclick = () => {
    replaceFlightNext = true;
    $("flight-input").click();
  };
  $("flight-input").onchange = safe(async (e) => {
    for (const [i, file] of [...e.target.files].entries())
      await importFlight(file, replaceFlightNext && i === 0);
    replaceFlightNext = false;
    e.target.value = "";
    showGallery("flights");
  });
  $("demo").onclick = $("demo-project").onclick = safe(async () => attachFlight(await app.api("/api/demo")));
  $("source-close").onclick = closeSourcePreview;
  $("source-preview").oncancel = (event) => { event.preventDefault(); closeSourcePreview(); };
  // Release playback and media resources on every dialog close.
  $("source-preview").onclose = () => {
    if (!$("source-preview").open) closeSourcePreview();
  };
  $("insert-source").onclick = () => {
    const a = S.assets.find((a) => a.id === selectedAsset);
    if (a) {
      snapshot();
      insertAsset(a, app.time);
      changed();
    }
  };
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        document
          .querySelectorAll("[data-filter]")
          .forEach((x) => x.classList.toggle("active", x === b));
        renderLibrary();
      }),
  );
  $("media-search").oninput = renderLibrary;
  $("play").onclick = safe(async () => {
    if (app.playing) {
      app.pause();
      return;
    }
    if (!duration()) return;
    closeSourcePreview();
    await engine.enableAudio();
    if (app.time >= duration()) app.time = 0;
    app.playing = true;
  });
  $("previous").onclick = () => app.seek(app.time - 1 / 30);
  $("next").onclick = () => app.seek(app.time + 1 / 30);
  $("play-speed").onchange = (e) => (app.speed = Number(e.target.value));
  $("undo").onclick = () => undo();
  $("redo").onclick = () => undo(true);
  $("split").onclick = splitSelected;
  $("delete").onclick = removeSelected;
  $("duplicate").onclick = duplicateSelected;
  $("add-track").onclick = () => {
    snapshot();
    availableTrack("video", 0, 0, true);
    changed();
  };
  $("add-title").onclick = () => {
    snapshot();
    const c = {
      ...makeClip(
        { id: null, type: "title", duration: 5 },
        availableTrack("title", app.time, 5),
        app.time,
      ),
      text: "Mein Flug",
      fontSize: 54,
      color: "#ffffff",
    };
    S.clips.push(c);
    selected = [c.id];
    changed();
  };
  $("timeline-mode").onchange = (e) => {
    compact = e.target.value === "film";
    renderTimeline();
    renderInspector();
    app.render();
  };
  $("zoom").oninput = e => setTimelineZoom(Number(e.target.value));
  $("zoom-selection").onclick = fitSelection;
  $("zoom-fit").onclick = () => {
    zoom = 0;
    $("zoom").value = 0;
    $("timeline-scroll").scrollLeft = 0;
    renderTimeline();
  };
  $("snap").onclick = () => {
    snapping = !snapping;
    $("snap").classList.toggle("active", snapping);
    $("snap").setAttribute("aria-pressed", snapping);
  };
  $("timeline-scroll").onscroll = e => { $("track-labels").style.transform = 'translateY(' + (-e.target.scrollTop) + 'px)'; renderRuler(); };
  $("timeline-scroll").addEventListener('wheel', e => {
    if (dragging) return;
    e.preventDefault(); const scroll = $("timeline-scroll"), delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroll.clientHeight : 1);
    if (e.altKey) { scroll.scrollTop += delta; return; }
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { scroll.scrollLeft += e.deltaX || delta; return; }
    setTimelineZoom(zoom - clamp(delta, -300, 300) * .003, e.clientX - scroll.getBoundingClientRect().left);
  }, { passive: false });
  $("ruler").onpointerdown = (e) => {
    e.preventDefault();
    const move = (ev) =>
        app.seek(
          editTime(
            (ev.clientX - $("timeline-content").getBoundingClientRect().left) /
              px,
          ),
        ),
      finish = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", finish);
      };
    move(e);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
  };
  $("range-start").oninput = $("range-end").oninput = readRange;
  $("mark-start").onclick = () => {
    rangeAuto = false;
    app.range[0] = app.time;
    renderRange();
  };
  $("mark-end").onclick = () => {
    rangeAuto = false;
    app.range[1] = app.time;
    renderRange();
  };
  $("range-all").onclick = () => {
    rangeAuto = true;
    app.range = [0, duration()];
    renderRange();
  };
  $("cut-range").onclick = safe(() => rangeEdit());
  $("speed-range").onclick = safe(() =>
    rangeEdit(Number($("range-speed").value)),
  );
  $("layout").onchange = (e) => {
    snapshot();
    S.layout = e.target.value;
    for (const clip of S.clips) clip.rect = null;
    changed();
  };
  $("aspect").onchange = (e) => {
    snapshot();
    S.aspect = e.target.value;
    app.size();
    changed();
  };
  $("reset-layout").onclick = () => {
    snapshot();
    for (const c of S.clips) c.rect = null;
    changed();
  };
  const setMouseMode = (windows) => {
    arrange = windows;
    $("map-mouse").checked = !arrange;
    $("mouse-hint").hidden = arrange;
    handleKey = "";
    fitStage();
  };
  $("map-mouse").onchange = (e) => setMouseMode(!e.target.checked);
  let imageWheelTimer;
  $("stage").addEventListener('wheel', e => {
    const handle = e.target.closest('.window-handle'), clip = handle && S.clips.find(c => c.id === handle.dataset.id);
    if (!arrange || !clip || !['video', 'photo'].includes(clip.kind) || trackFor(clip)?.locked) return;
    e.preventDefault(); app.pause(); if (!imageWheelTimer) snapshot(); clearTimeout(imageWheelTimer);
    const transform = imageTransform(clip.imageTransform);
    clip.imageTransform = imageTransform({ ...transform, zoom: transform.zoom * Math.exp(-clamp(e.deltaY * (e.deltaMode === 1 ? 16 : 1), -300, 300) * .0015) });
    imageWheelTimer = setTimeout(() => { imageWheelTimer = null; changed(); }, 180);
  }, { passive: false });
  let wheelTimer;
  $("stage").addEventListener(
    "wheel",
    (e) => {
      const handle = e.target.closest(".window-handle.flight"),
        clip = handle && S.clips.find((c) => c.id === handle.dataset.id);
      if (arrange || !clip || trackFor(clip)?.locked) return;
      e.preventDefault();
      app.pause();
      if (!wheelTimer) snapshot();
      clearTimeout(wheelTimer);
      const factor = Math.exp(clamp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1), -500, 500) * .001);
      if (S.map.camera === "follow") {
        S.map.range = clamp(S.map.range * factor, 100, 200000);
      } else {
        map.moveGesture(map.gesture(), 0, 0, false, factor);
        S.map.camera = "fixed";
        S.map.heading = map.heading;
        S.map.pitch = map.pitch;
        S.map.range = map.range;
        S.viewPose = map.pose();
      }
      wheelTimer = setTimeout(() => { wheelTimer = null; changed(); }, 180);
    },
    { passive: false },
  );
  $("map-style").onchange = (e) => {
    snapshot();
    S.map.style = e.target.value;
    changed();
  };
  $("relief-opacity").oninput = (e) => {
    S.map.opacity = Number(e.target.value) / 100;
  };
  $("relief-opacity").onchange = changed;
  $("camera-mode").onchange = (e) => {
    snapshot();
    S.map.camera = e.target.value;
    changed();
  };
  $("frame-flight").onclick = () => {
    if (!S.flight) return;
    snapshot();
    map.frame();
    S.map.camera = "fixed";
    changed();
  };
  for (const id of ["camera-heading", "camera-pitch", "camera-range"]) {
    $(id).oninput = () => {
      app.pause();
      S.map.heading = (Number($("camera-heading").value) * Math.PI) / 180;
      S.map.pitch = (-Number($("camera-pitch").value) * Math.PI) / 180;
      S.map.range = Number($("camera-range").value);
      map.heading = S.map.heading;
      map.pitch = S.map.pitch;
      map.range = S.map.range;
      map.orbit();
      if (S.map.camera !== "follow") S.map.camera = "fixed";
      cameraLabels();
    };
    $(id).onchange = changed;
  }
  for (const id of [
    "camera-heading",
    "camera-pitch",
    "camera-range",
    "relief-opacity",
    "background",
  ])
    $(id).addEventListener("pointerdown", snapshot);
  $("camera-add").onclick = safe(() => {
    if (!S.flight) throw new Error("Bitte zuerst eine Flugspur verbinden.");
    const pose = map.pose();
    snapshot();
    if (!S.map.frames.length) {
      S.map.initial = pose;
      S.map.frames.push({ time: 0, duration: 0, pose });
    } else {
      const frame = {
        time: app.time * 1000,
        duration: Number($("camera-duration").value),
        pose,
      };
      validateCameraFrame(
        { ...frame, time: outputDuration(intervals, 0, app.time) * 1000 },
        S.map.frames.map((f) => ({
          ...f,
          time: outputDuration(intervals, 0, f.time / 1000) * 1000,
        })),
        { start: 0, end: outputDuration(intervals) * 1000 },
      );
      S.map.frames.push(frame);
      S.map.frames.sort((a, b) => a.time - b.time);
    }
    S.map.camera = "path";
    changed();
  });
  $("gap-auto").onchange = (e) => {
    snapshot();
    S.gaps.enabled = e.target.checked;
    changed();
  };
  $("gap-50").onclick = () => {
    snapshot();
    S.gaps = { enabled: true, speed: 50, explicit: true };
    changed();
  };
  $("gap-speed").onchange = (e) => {
    snapshot();
    S.gaps.speed = clamp(Number(e.target.value) || 50, 1, 200);
    changed();
  };
  $("timezone").onchange = (e) => {
    snapshot();
    S.zone = e.target.value;
    changed();
  };
  $("background").oninput = (e) => (S.background = e.target.value);
  $("background").onchange = changed;
  $("project-name").onchange = $("project-name-settings").onchange = (e) => {
    S.name = e.target.value || "Mein Flugfilm";
    scheduleSave();
  };
  $("save-project").onclick = () =>
    download(
      JSON.stringify(project(), null, 2),
      S.name.replace(/[^\p{L}\p{N} _-]/gu, "") + ".flightstudio",
    );
  $("open-project").onclick = () => $("project-input").click();
  $("project-input").onchange = safe(async (e) => {
    if (e.target.files[0])
      await restore(JSON.parse(await e.target.files[0].text()));
    e.target.value = "";
  });
  $("new-project").onclick = () => {
    snapshot();
    app.pause();
    S = fresh();
    selected = [];
    selectedAsset = null;
    app.time = 0;
    rangeAuto = true;
    app.size();
    changed();
    app.toast(
      "Neues Projekt. Das vorige lässt sich mit Rückgängig wiederherstellen.",
    );
  };
  $("export-kml").onclick = () =>
    S.flight &&
    download(
      toKML(S.flight),
      "Flug.kml",
      "application/vnd.google-earth.kml+xml",
    );
  $("help").onclick = () => $("help-dialog").showModal();
  $("help-close").onclick = () => $("help-dialog").close();
  $("export-open").onclick = safe(() => {
    if (!duration() && !exporter.background)
      throw new Error("Bitte zuerst Material in die Timeline einsetzen.");
    readRange();
    if (app.range[1] <= app.range[0]) {
      app.range = [0, duration()];
      renderRange();
    }
    app.pause();
    $("export-summary").textContent =
      `${format(viewTime(app.range[0]))} – ${format(viewTime(app.range[1]))} · Film ca. ${format(app.outputLength(...app.range))} · ${S.aspect} · ${S.tracks.length} Spuren`;
    $("export-dialog").showModal();
    updateExportSpecs();
    if (exporter.background)
      void exporter.refresh().catch((e) => app.toast(e.message, true));
  });
  const updateExportSpecs = () => {
    const { width, height } = pixelSize(S.aspect, Number($("export-size").value));
    $("export-specs").textContent = `${width} × ${height} px · ${$("export-fps").value} fps · ` +
      (Number($("export-size").value) >= 1440 || Number($("export-fps").value) >= 50
        ? "Hohe Auflösung/Bildrate: mehr Rechenzeit und Speicherplatz. Die Vorschau bleibt unverändert."
        : "Die Exportauflösung ist unabhängig von der Vorschau.");
  };
  for (const id of ["export-size", "export-fps", "export-quality"])
    $(id).onchange = updateExportSpecs;
  $("export-close").onclick = () => {
    if (!exporter.active) {
      $("export-result").pause();
      $("export-dialog").close();
    }
  };
  $("export-dialog").addEventListener("cancel", (e) => {
    if (exporter.active) e.preventDefault();
  });
  $("export-start").onclick = safe(async () => {
    $("export-start").disabled = true;
    $("export-close").disabled = true;
    $("export-cancel").hidden = false;
    $("export-download").hidden = true;
    $("export-result").pause();
    $("export-result").hidden = true;
    $("export-progress").hidden = false;
    try {
      await exporter.start({
        format: $("export-format").value,
        size: Number($("export-size").value),
        fps: Number($("export-fps").value),
        quality: $("export-quality").value,
        acceleration: $("export-acceleration").value,
        audio: $("export-audio").checked,
      });
    } catch (e) {
      $("export-start").disabled = false;
      $("export-close").disabled = false;
      $("export-cancel").hidden = true;
      throw e;
    }
  });
  $("export-cancel").onclick = () => exporter.cancel();
  $("timeline-resizer").onpointerdown = (e) => {
    e.preventDefault();
    const y = e.clientY,
      height = document.querySelector(".timeline-panel").clientHeight,
      move = (event) => {
        document.documentElement.style.setProperty(
          "--timeline",
          clamp(height + y - event.clientY, 220, window.innerHeight - 420) +
            "px",
        );
        fitStage();
      },
      finish = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", finish);
        renderTimeline();
      };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
  };
  document.addEventListener("keydown", (e) => {
    if (
      app.exporting || tutorial?.active ||
      /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) ||
      $("source-preview").open ||
      $("help-dialog").open ||
      $("export-dialog").open || $("updates-dialog")?.open
    )
      return;
    const key = e.key.toLowerCase();
    if (selectedInstrument && activePanel === "instruments" && ["Delete", "Backspace"].includes(e.key)) { e.preventDefault(); snapshot(); S.instruments = (S.instruments || []).filter(i => i.id !== selectedInstrument); selectedInstrument = null; changed(); return; }
    if (key === "escape") showPanel(null);
    if (key === 'f' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (e.shiftKey) $("zoom-fit").click(); else fitSelection(); }
    if (['+', '=', '-'].includes(key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setTimelineZoom(zoom + (key === '-' ? -.35 : .35)); }
    if (key === 'n' && !e.ctrlKey && !e.metaKey) $("snap").click();
    if (e.code === "Space") {
      e.preventDefault();
      $("play").click();
    }
    if (key === "s" && !e.ctrlKey) splitSelected();
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSelected();
    }
    if (key === "d" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      duplicateSelected();
    }
    if (key === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undo(e.shiftKey);
    }
    if (key === "y" && e.ctrlKey) {
      e.preventDefault();
      undo(true);
    }
    if (e.key === "ArrowLeft") app.seek(app.time - (e.shiftKey ? 5 : 1 / 30));
    if (e.key === "ArrowRight") app.seek(app.time + (e.shiftKey ? 5 : 1 / 30));
    if (key === "i") $("mark-start").click();
    if (key === "o") $("mark-end").click();
  });
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files"))
      document.body.classList.add("drag-files");
  });
  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) document.body.classList.remove("drag-files");
  });
  document.addEventListener(
    "drop",
    safe(async (e) => {
      document.body.classList.remove("drag-files");
      if (tutorial?.active || !e.dataTransfer.files.length) return;
      e.preventDefault();
      const files = [...e.dataTransfer.files],
        flights = files.filter((f) => /\.(igc|kml|kmz)$/i.test(f.name));
      for (const file of flights) await importFlight(file);
      const media = files.filter((x) => !flights.includes(x));
      if (media.length) await importFiles(media);
    }),
  );
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    if (document.hidden) {
      engine.pause();
      if (exporter.active && exporter.recorder?.state === "recording")
        exporter.recorder.pause();
      else app.pause();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (app.exporting || saving) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  new ResizeObserver(() => {
    fitStage();
    if (!dragging) renderTimeline();
  }).observe(document.querySelector(".viewer"));
}
function tick(now) {
  if (now - last < 32) {
    nextFrame(tick);
    return;
  }
  const elapsed = (now - last) / 1000 || 0;
  const dt = app.exporting ? elapsed : Math.min(0.1, elapsed);
  last = now;
  try {
    const hold = app.render();
    if (exporter.active) exporter.frame(hold);
    if (
      app.playing &&
      !hold &&
      (!app.exporting || (!document.hidden && exporter.pending <= 8))
    ) {
      const finish = app.exporting ? app.range[1] : duration();
      app.time = Math.min(
        finish,
        advancePlayback(intervals, app.time, dt * app.speed),
      );
      if (app.time >= finish) {
        app.pause();
        if (exporter.active) void exporter.finish();
      }
    }
  } catch (e) {
    app.pause();
    if (exporter.active) void exporter.fail(e);
    console.error(e);
  }
  nextFrame(tick);
}
async function init() {
  await installLanguageUI();
  await installThemeUI();
  busy(true, "FlightStudio V2 wird gestartet …");
  if (!window.Cesium)
    await new Promise((resolve, reject) => {
      const s = document.querySelector('script[src*="Cesium.js"]');
      s.addEventListener("load", resolve, { once: true });
      s.addEventListener(
        "error",
        () => reject(new Error("3D-Bibliothek fehlt.")),
        { once: true },
      );
    });
  const status = await app.api("/api/status");
  token = status.token;
  map = new FlightMap((message) => app.toast(message, true));
  engine = new MediaEngine((message) => {
    app.mediaError = message;
    app.pause();
    app.toast(message, true);
    if (exporter?.active) void exporter.fail(new Error(message));
  }, Boolean(renderJob));
  exporter =
    !renderJob && status.backgroundExport
      ? new BackgroundExporter(app)
      : new RecorderExporter(app);
  if (!exporter.background && !renderJob) {
    for (const option of $("export-size").options) option.disabled = Number(option.value) > 1080;
    $("export-fps").disabled = true;
    $("export-quality").disabled = true;
    $("export-acceleration").disabled = true;
    $("export-fps").title = $("export-quality").title = "Weitere Exportoptionen benötigen die Desktop-App.";
  }
  $("export-hint").textContent = status.backgroundExport
    ? "Export im Hintergrund: Du kannst weiterarbeiten oder das Editorfenster schliessen. Der Rechner und der FlightStudio-Hintergrundprozess müssen weiterlaufen. Jedes Bild wird anhand der Timeline berechnet. Die Dauer hängt von Film, Auflösung und Rechner ab."
    : "Aufzeichnung wie in der Vorschau. Diesen Tab sichtbar lassen. Für Export bei geschlossenem Fenster die Desktop-App verwenden.";
  if (!renderJob) instrumentPanel = installInstruments({ state: () => S, selected: () => selectedInstrument, select: selectInstrument, commit: fn => { app.pause(); snapshot(); fn(); changed(); } });
  wire();
  window.addEventListener("flightstudio-language", () => { renderSelection(); handleKey = ""; instrumentPanel?.render(); exporter.background && void exporter.refresh(); });
  if (renderJob) {
    const scene = await app.api(`/api/exports/${renderJob}/scene`);
    await restore(scene.project);
    rangeAuto = false;
    app.range = scene.range;
    renderRange();
    busy(false);
    app.prepareExportFrame = frame => engine.prepareExport(S, app.time, clipId =>
      app.api(`/api/exports/${renderJob}/media-frame`, {method:"POST", binary:true, body:JSON.stringify({clipId,frame})}));
    await renderExport(app, scene, renderJob);
    return;
  }
  void installUpdates(app).catch(() => {});
  const saved = await app.api("/api/project");
  if (saved?.version) {
    try {
      await restore(saved);
    } catch (e) {
      S = fresh();
      intervals = [];
      refresh();
      app.toast(
        "Gespeichertes Projekt konnte nicht geladen werden: " + e.message,
        true,
      );
    }
  } else {
    intervals = playbackIntervals(S);
    refresh();
  }
  app.size();
  tutorial = installTutorial({
    pause: () => { app.pause(); $("source-video").pause(); $("source-audio").pause(); },
    canStart: () => {
      if (!app.exporting && !dragging) return true;
      app.toast(t("Bitte den laufenden Vorgang zuerst beenden."));
      return false;
    },
    captureUI: () => ({ gallery: activeGallery, panel: activePanel,
      details: [...document.querySelectorAll('.library details,.inspector details')].map(el => [el, el.open]) }),
    prepareUI: step => {
      if (activeGallery !== step.gallery) showGallery(step.gallery);
      if (activePanel !== step.panel) showPanel(step.panel);
      if (step.panel === 'camera') $("camera-panel").open = true;
      if (step.panel === 'project') $("project-panel").open = true;
    },
    restoreUI: ui => {
      if (!ui) return;
      showGallery(ui.gallery); showPanel(ui.panel);
      for (const [el, open] of ui.details) if (el.isConnected) el.open = open;
    },
  });
  busy(false);
  nextFrame(tick);
  if (exporter.background) void exporter.refresh().catch(() => {});
}
init().catch((e) => {
  if (renderJob)
    void app
      .api(`/api/exports/${renderJob}/fail`, {
        method: "POST",
        body: JSON.stringify({ error: e.message }),
      })
      .catch(() => {});
  busy(false);
  app.toast("Start fehlgeschlagen: " + e.message, true);
  console.error(e);
});
