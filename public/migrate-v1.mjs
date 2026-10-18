import { editMap, visibleClipRanges, outputAt } from "../lib/edit.mjs";
import { parseCaptureTime } from "../lib/time.mjs";
import { makeClip } from "../lib/timeline.mjs";
export function convertV1(old, assets, createProject) {
  const p = createProject();
  p.gaps.enabled = false;
  p.playhead = old.time || 0;
  p.viewPose = old.viewPose;
  p.name = "Import aus V1";
  p.flight = old.flight;
  p.origin = old.flight?.start;
  p.zone = old.zone || p.zone;
  p.layout =
    old.focus === "map"
      ? "map-main"
      : old.layout === "split"
        ? "grid"
        : old.layout === "stack"
          ? "stack"
          : "pip";
  p.map = {
    ...p.map,
    style: old.mapStyle || "satellite",
    camera: old.cameraMode || "follow",
    initial: old.initialPose,
    ...old.followPose,
    frames: (old.cameraFrames || []).flatMap((f) => {
      const t = outputAt(f.anchor, old.segments || []);
      return t === null
        ? []
        : [{ time: t * 1000, duration: f.duration, pose: f.pose }];
    }),
  };
  p.tracks = [
    {
      id: "flight",
      name: "3D-Flug",
      kind: "flight",
      visible: true,
      locked: false,
      muted: false,
    },
  ];
  p.clips = editMap(old.segments || []).map((s) => ({
    ...makeClip(
      {
        id: "flight",
        type: "flight",
        duration: (old.flight.end - old.flight.start) / 1000,
      },
      "flight",
      s.outStart,
    ),
    in: (s.start - old.flight.start) / 1000,
    out: (s.end - old.flight.start) / 1000,
    rate: s.rate,
    showStats: old.showStats,
  }));
  const seen = new Set();
  for (const m of old.media || []) {
    const a =
      assets.find((x) => x.id === m.id) ||
      assets.find((x) => x.name === m.name);
    if (!a)
      throw new Error(
        "V1-Medium fehlt: " +
          m.name +
          ". Bitte zuerst in V2 importieren und das Projekt danach erneut öffnen.",
      );
    if (!seen.has(a.id)) {
      p.assets.push({
        ...a,
        duration: m.type === "photo" ? m.duration : a.duration,
      });
      seen.add(a.id);
    }
    const captured =
      m.manualTime ?? parseCaptureTime(m.capture?.raw, p.zone, 0, m.ignoreZone);
    if (captured === null) continue;
    const base = captured + (m.offset || 0) * 1000;
    if (!Number.isFinite(base)) continue;
    const track = crypto.randomUUID();
    p.tracks.push({
      id: track,
      name: a.name,
      kind: "video",
      visible: true,
      muted: false,
      locked: false,
    });
    for (const span of visibleClipRanges(
      base + m.trimIn * 1000,
      base + m.trimOut * 1000,
      old.segments,
    ))
      p.clips.push({
        ...makeClip(a, track, span.start),
        in: (span.sourceStart - base) / 1000,
        out: (span.sourceEnd - base) / 1000,
        rate: span.rate,
      });
  }
  return p;
}
