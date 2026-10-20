import { validateInstruments } from './instruments.mjs';
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const length = (c) => (c.out - c.in) / c.rate;
export const end = (c) => c.start + length(c);
export const sourceTime = (c, t) => c.in + (t - c.start) * c.rate;
export const active = (c, t) => c.enabled !== false && t >= c.start - 1e-7 && t < end(c) - 1e-7;
export const sequenceDuration = (clips) => Math.max(0, ...clips.map(end));
export function makeClip(asset, trackId, start = 0, id = crypto.randomUUID()) {
  return {
    id,
    assetId: asset.id,
    kind: asset.type,
    trackId,
    start: Math.max(0, start),
    in: 0,
    out: asset.duration,
    rate: 1,
    volume: 1,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    audioFadeIn: 0,
    audioFadeOut: 0,
    fit: "contain",
    rect: null,
    auto: false,
  };
}
export function splitClip(c, time, id = crypto.randomUUID()) {
  if (time <= c.start + 0.02 || time >= end(c) - 0.02) return [{ ...c }];
  const middle = sourceTime(c, time);
  return [
    { ...c, out: middle, fadeOut: 0, audioFadeOut: 0 },
    { ...c, id, start: time, in: middle, fadeIn: 0, audioFadeIn: 0, transitionIn: null },
  ];
}
// A global edit maps sequence time while preserving each clip's source interval.
export function editRange(
  clips,
  from,
  to,
  rate = null,
  { ripple = true, ids = null, idFactory = () => crypto.randomUUID() } = {},
) {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to - from < 0.02
  )
    throw new Error("Bitte einen gültigen Bereich wählen.");
  if (rate !== null && (!Number.isFinite(rate) || rate < 0.1 || rate > 200))
    throw new Error("Tempo muss zwischen 0.1× und 200× liegen.");
  if (
    rate !== null &&
    clips.some(
      (c) =>
        (!ids || ids.includes(c.id)) &&
        end(c) > from &&
        c.start < to &&
        c.rate * rate > 200,
    )
  )
    throw new Error(
      "Das resultierende Clip-Tempo darf höchstens 200× betragen.",
    );
  const delta = rate === null ? -(to - from) : (to - from) / rate - (to - from),
    result = [];
  for (const c of clips) {
    if (ids && !ids.includes(c.id)) {
      result.push({ ...c });
      continue;
    }
    const finish = end(c);
    if (finish <= from) {
      result.push({ ...c });
      continue;
    }
    if (c.start >= to) {
      result.push({ ...c, start: ripple ? c.start + delta : c.start });
      continue;
    }
    const a = Math.max(c.start, from),
      b = Math.min(finish, to),
      pieces = [];
    if (c.start < a) pieces.push({ ...c, out: sourceTime(c, a), fadeOut: 0, audioFadeOut: 0 });
    if (rate !== null)
      pieces.push({
        ...c,
        start: ripple ? from + (a - from) / rate : a,
        in: sourceTime(c, a),
        out: sourceTime(c, b),
        rate: c.rate * rate,
        manualSpeed: true,
        fadeIn: 0,
        fadeOut: 0,
        audioFadeIn: 0,
        audioFadeOut: 0,
        transitionIn: null,
      });
    if (b < finish)
      pieces.push({
        ...c,
        start: ripple ? b + delta : b,
        in: sourceTime(c, b),
        fadeIn: 0,
        audioFadeIn: 0,
        transitionIn: null,
      });
    pieces.forEach((p, i) => {
      p.id = i ? idFactory() : c.id;
      result.push(p);
    });
  }
  return result;
}
export function snapTime(time, clips, excluded, playhead, tolerance) {
  const stops = [
    0,
    playhead,
    ...clips
      .filter((c) => !excluded.includes(c.id))
      .flatMap((c) => [c.start, end(c)]),
  ];
  let best = time,
    distance = tolerance;
  for (const stop of stops) {
    const d = Math.abs(stop - time);
    if (d < distance) {
      distance = d;
      best = stop;
    }
  }
  return Math.max(0, best);
}
export function fitsTrack(clips, trackId, start, duration) {
  return !clips.some(
    (c) =>
      c.trackId === trackId &&
      c.start < start + duration - 0.001 &&
      end(c) > start + 0.001,
  );
}
export function timedClips(
  asset,
  time,
  flight,
  flightClips,
  trackId,
  idFactory = () => crypto.randomUUID(),
) {
  if (!Number.isFinite(time) || !flight) return [];
  const seconds = (time - flight.start) / 1000;
  return flightClips.flatMap((f) => {
    const a = Math.max(seconds, f.in),
      b = Math.min(seconds + asset.duration, f.out);
    return b > a
      ? [
          {
            ...makeClip(
              asset,
              trackId,
              f.start + (a - f.in) / f.rate,
              idFactory(),
            ),
            in: a - seconds,
            out: b - seconds,
            rate: f.rate,
            auto: true,
          },
        ]
      : [];
  });
}
export function normalizedRect(rect) {
  if (!rect) return null;
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const w = clamp(finite(rect.w, 1), 0.04, 5),
    h = clamp(finite(rect.h, 1), 0.04, 5);
  return {
    x: clamp(finite(rect.x, 0), -5, 5),
    y: clamp(finite(rect.y, 0), -5, 5),
    w,
    h,
  };
}
export function sceneLayout(clips, preset = "auto") {
  const flight = clips.find((c) => c.kind === "flight");
  return flight?.layout && flight.layout !== "inherit" ? flight.layout : preset;
}
export function removeTrack(project, id) {
  const track = project.tracks.find((t) => t.id === id);
  if (!track || track.locked) return false;
  project.tracks = project.tracks.filter((t) => t.id !== id);
  project.clips = project.clips.filter((c) => c.trackId !== id);
  return true;
}
export function layoutRects(clips, preset = "auto") {
  preset = sceneLayout(clips, preset);
  const media = clips.filter(
      (c) => c.kind !== "flight" && c.kind !== "audio" && c.kind !== "title",
    ),
    flights = clips.filter((c) => c.kind === "flight"),
    result = new Map();
  // Explicit grid/stack layouts include the map as an equal tile. Automatic
  // layout keeps the familiar video grid with a floating map inset.
  if (["grid", "stack"].includes(preset)) {
    const tiles = [...media, ...flights],
      cols = preset === "stack" ? 1 : Math.ceil(Math.sqrt(tiles.length)),
      rows = Math.ceil(tiles.length / cols);
    tiles.forEach((c, i) => result.set(c.id, normalizedRect(c.rect || {
      x: (i % cols) / cols, y: Math.floor(i / cols) / rows,
      w: 1 / cols, h: 1 / rows,
    })));
    clips.filter((c) => c.kind === "title").forEach((c) =>
      result.set(c.id, normalizedRect(c.rect || { x: .1, y: .73, w: .8, h: .2 })));
    return result;
  }
  media.forEach((c, i) => {
    let rect;
    if (preset === "map-main") {
      const cols = Math.min(3, media.length),
        rows = Math.ceil(media.length / cols),
        height = Math.min(0.26, 0.85 / rows);
      rect = {
        x: 0.03 + (i % cols) * 0.32,
        y: 0.95 - rows * height + Math.floor(i / cols) * height,
        w: 0.29,
        h: height - 0.02,
      };
    } else if (preset === "pip") {
      rect =
        i === 0
          ? { x: 0, y: 0, w: 1, h: 1 }
          : { x: 0.7, y: 0.04 + (i - 1) * 0.24, w: 0.27, h: 0.22 };
    } else if (preset === "single") {
      rect = { x: 0, y: 0, w: 1, h: 1 };
    } else if (media.length === 1) {
      rect = { x: 0, y: 0, w: 1, h: 1 };
    } else if (preset === "stack") {
      rect = { x: 0, y: i / media.length, w: 1, h: 1 / media.length };
    } else {
      const cols = media.length === 2 ? 2 : Math.ceil(Math.sqrt(media.length)),
        rows = Math.ceil(media.length / cols);
      rect = {
        x: (i % cols) / cols,
        y: Math.floor(i / cols) / rows,
        w: 1 / cols,
        h: 1 / rows,
      };
    }
    result.set(c.id, normalizedRect(c.rect || rect));
  });
  flights.forEach((c) =>
    result.set(
      c.id,
      normalizedRect(
        c.rect ||
          (!media.length || preset === "map-main"
            ? { x: 0, y: 0, w: 1, h: 1 }
            : { x: 0.7, y: 0.69, w: 0.27, h: 0.27 }),
      ),
    ),
  );
  clips
    .filter((c) => c.kind === "title")
    .forEach((c) =>
      result.set(
        c.id,
        normalizedRect(c.rect || { x: 0.1, y: 0.73, w: 0.8, h: 0.2 }),
      ),
    );
  return result;
}
export function fade(c, t) {
  return clamp(
    Math.min(
      c.fadeIn ? (t - c.start) / c.fadeIn : 1,
      c.fadeOut ? (end(c) - t) / c.fadeOut : 1,
    ),
    0,
    1,
  );
}
// Automatic fast-forward is a reversible playback map. Editing positions and
// recording timestamps stay intact; moving a video immediately recalculates gaps.
export function playbackIntervals(state) {
  const clips = state.clips,
    duration = sequenceDuration(clips),
    visible = new Set(state.tracks.filter((t) => t.visible).map((t) => t.id));
  const flights = clips.filter(
      (c) => c.kind === "flight" && visible.has(c.trackId),
    ),
    media = clips.filter(
      (c) => ["video", "photo"].includes(c.kind) && visible.has(c.trackId),
    );
  const boundaries = [
      ...new Set([
        0,
        duration,
        ...[...flights, ...media].flatMap((c) => [c.start, end(c)]),
      ]),
    ].sort((a, b) => a - b),
    result = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i],
      finish = boundaries[i + 1],
      mid = (start + finish) / 2,
      flight = flights.find((c) => active(c, mid));
    const automatic =
      state.gaps?.enabled === true &&
      flight &&
      !flight.manualSpeed &&
      flight.rate === 1 &&
      !media.some((c) => active(c, mid));
    const rate = automatic ? clamp(Number(state.gaps?.speed) || 50, 1, 200) : 1;
    const prev = result.at(-1);
    if (prev && prev.rate === rate) prev.end = finish;
    else result.push({ start, end: finish, rate });
  }
  return result;
}
export function playbackRateAt(intervals, time) {
  return intervals.find((s) => time >= s.start && time < s.end)?.rate || 1;
}
export function outputDuration(intervals, from = 0, to = Infinity) {
  return intervals.reduce(
    (sum, s) =>
      sum + Math.max(0, Math.min(to, s.end) - Math.max(from, s.start)) / s.rate,
    0,
  );
}
export function advancePlayback(intervals, time, seconds) {
  let position = time,
    remaining = seconds;
  for (const s of intervals) {
    if (s.end <= position) continue;
    const amount = (s.end - position) / s.rate;
    if (remaining < amount) return position + remaining * s.rate;
    remaining -= amount;
    position = s.end;
  }
  return position;
}
export function validateProject(p) {
  validateInstruments(p.instruments);
  if (
    p.version !== 2 ||
    !Array.isArray(p.assets) ||
    !Array.isArray(p.clips) ||
    !Array.isArray(p.tracks)
  )
    throw new Error("Kein gültiges V2-Projekt.");
  if (p.aspect && !["16:9", "9:16", "1:1"].includes(p.aspect))
    throw new Error("Ungültiges Bildformat.");
  if (p.flightOverlays != null && !Array.isArray(p.flightOverlays))
    throw new Error("Ungültige zusätzliche Flugspuren.");
  const overlayIds = new Set();
  for (const o of p.flightOverlays || []) {
    if (
      !p.flight ||
      !o.id ||
      overlayIds.has(o.id) ||
      !/^#[0-9a-f]{6}$/i.test(o.color) ||
      !["absolute", "start"].includes(o.alignment) ||
      !Number.isFinite(o.offsetSeconds) ||
      !Array.isArray(o.flight?.points) ||
      o.flight.points.length < 2
    )
      throw new Error("Ungültige zusätzliche Flugspur.");
    overlayIds.add(o.id);
    if (
      !o.flight.points.every(
        (point, i, points) =>
          [point.time, point.lat, point.lon, point.alt].every(
            Number.isFinite,
          ) &&
          Math.abs(point.lat) <= 90 &&
          Math.abs(point.lon) <= 180 &&
          (!i || point.time > points[i - 1].time),
      )
    )
      throw new Error("Ungültige GPS-Punkte in zusätzlicher Flugspur.");
  }
  const tracks = new Set(p.tracks.map((t) => t.id)),
    assets = new Map(p.assets.map((a) => [a.id, a])),
    ids = new Set();
  for (const c of p.clips) {
    if (
      ids.has(c.id) ||
      !tracks.has(c.trackId) ||
      ![c.start, c.in, c.out, c.rate].every(Number.isFinite) ||
      c.start < 0 ||
      c.in < 0 ||
      c.out <= c.in ||
      c.rate < 0.01 ||
      c.rate > 200
    )
      throw new Error("Ungültiger Clip im Projekt.");
    ids.add(c.id);
    if (c.kind === "flight") {
      if (c.layout && !["inherit", "auto", "grid", "stack", "pip", "map-main", "single"].includes(c.layout))
        throw new Error("Unbekanntes Layout im Flugabschnitt.");
      if (
        c.mapStyle &&
        !["inherit", "satellite", "osm", "relief", "overlay"].includes(
          c.mapStyle,
        )
      )
        throw new Error("Unbekannter Kartenstil im Flugabschnitt.");
      if (
        c.mapOpacity != null &&
        (!Number.isFinite(c.mapOpacity) || c.mapOpacity < 0 || c.mapOpacity > 1)
      )
        throw new Error("Ungültige Relief-Deckkraft.");
      if (!p.flight || c.out > (p.flight.end - p.flight.start) / 1000 + 0.05)
        throw new Error("Ungültiger Flugabschnitt.");
    } else if (c.kind !== "title") {
      const a = assets.get(c.assetId);
      if (!a || c.out > a.duration + 0.05)
        throw new Error("Ungültige Medienreferenz.");
    }
    c.rect = normalizedRect(c.rect);
    for (const key of ['volume', 'opacity', 'fadeIn', 'fadeOut', 'audioFadeIn', 'audioFadeOut']) {
      if (c[key] != null && (!Number.isFinite(c[key]) || c[key] < 0 ||
          c[key] > (key === 'volume' ? 2 : key === 'opacity' ? 1 : 86400)))
        throw new Error('Ungültige Clip-Einstellungen.');
    }
    if (c.imageTransform && !['zoom', 'x', 'y'].every(key => Number.isFinite(c.imageTransform[key])))
      throw new Error('Ungültige Bildposition.');
    if (c.statsRect) c.statsRect = normalizedRect(c.statsRect);
  }
  return p;
}

export function clipMapSettings(defaults, clip) {
  return {
    ...defaults,
    style:
      clip.mapStyle && clip.mapStyle !== "inherit"
        ? clip.mapStyle
        : defaults.style,
    opacity: clip.mapOpacity ?? defaults.opacity,
  };
}
