import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeClip,
  splitClip,
  editRange,
  sourceTime,
  end,
  timedClips,
  layoutRects,
  sceneLayout,
  removeTrack,
  snapTime,
  validateProject,
} from "../lib/timeline.mjs";
import {
  playbackIntervals,
  outputDuration,
  advancePlayback,
  playbackRateAt,
} from "../lib/timeline.mjs";
const asset = { id: "a", type: "video", duration: 20 },
  clip = () => makeClip(asset, "v1", 10, "c");
test("split preserves exact source time across clip speed", () => {
  const c = { ...clip(), rate: 2 };
  const [a, b] = splitClip(c, 14, "d");
  assert.equal(a.out, 8);
  assert.equal(b.in, 8);
  assert.equal(end(a), 14);
  assert.equal(sourceTime(b, 15), 10);
});
test("ripple delete removes identical time from parallel cameras and flight", () => {
  const clips = [
    clip(),
    { ...clip(), id: "flight", kind: "flight" },
    { ...clip(), id: "later", start: 40 },
  ];
  const r = editRange(clips, 15, 20);
  assert.equal(r.length, 5);
  assert.equal(r.find((c) => c.id === "later").start, 35);
  const parts = r.filter((c) => c.kind === "video" && c.start < 30);
  assert.equal(sourceTime(parts[1], 15), 10);
});
test("media-only cut keeps other tracks and the sequence clock intact", () => {
  const c = clip(),
    f = { ...c, id: "f", kind: "flight" };
  const r = editRange([c, f], 15, 20, null, { ripple: false, ids: ["c"] });
  assert.equal(r[1].start, 20);
  assert.deepEqual(r.at(-1), f);
});
test("speed interval retimes all layers without losing source frames", () => {
  const r = editRange([clip()], 15, 25, 10);
  assert.equal(r.length, 3);
  assert.equal(r[1].rate, 10);
  assert.equal(r[1].start, 15);
  assert.equal(r[2].start, 16);
  assert.equal(r[2].in, 15);
  assert.equal(end(r[2]), 21);
});
test("timestamp alignment handles flight cuts and time compression", () => {
  const flight = { start: 100000 };
  const spans = [
    { start: 0, in: 0, out: 10, rate: 1 },
    { start: 10, in: 30, out: 60, rate: 10 },
  ];
  const r = timedClips(asset, 135000, flight, spans, "v2");
  assert.equal(r[0].start, 10.5);
  assert.equal(r[0].rate, 10);
  assert.equal(r[0].in, 0);
  assert.equal(r[0].out, 20);
});
test("concurrent videos get separate rectangles plus a map inset", () => {
  const clips = [
      clip(),
      { ...clip(), id: "b" },
      { ...clip(), id: "f", kind: "flight" },
    ],
    r = layoutRects(clips);
  assert.equal(r.get("c").w, 0.5);
  assert.equal(r.get("b").x, 0.5);
  assert.equal(r.get("f").w, 0.27);
});
test("snap excludes moving clips and clamps negative times", () => {
  assert.equal(snapTime(9.9, [clip()], [], 50, 0.2), 10);
  assert.equal(snapTime(9.9, [clip()], ["c"], 50, 0.2), 9.9);
  assert.equal(snapTime(-2, [], [], 0, 0.1), 0);
});
test("a flight clip can join the grid without changing adjacent sections", () => {
  const video = clip();
  const flight = { ...clip(), id: "map", kind: "flight", layout: "inherit", rect: null };
  const [first, second] = splitClip(flight, 20, "map-next");
  second.layout = "grid";
  assert.equal(sceneLayout([video, first], "pip"), "pip");
  assert.equal(layoutRects([video, first], "pip").get("map").w, .27);
  const grid = layoutRects([video, second], "pip");
  assert.deepEqual(grid.get("c"), { x: 0, y: 0, w: .5, h: 1 });
  assert.deepEqual(grid.get("map-next"), { x: .5, y: 0, w: .5, h: 1 });
  assert.equal(first.layout, "inherit");
  assert.equal(sceneLayout([video, { ...second, layout: "map-main" }], "grid"), "map-main");
});
test("removing a track removes only its clips and keeps source media and locked tracks", () => {
  const p = { assets: [asset], tracks: [{ id: "v1" }, { id: "v2", locked: true }], clips: [clip(), { ...clip(), id: "other", trackId: "v2" }] };
  const before = structuredClone(p);
  assert.equal(removeTrack(p, "v2"), false);
  assert.deepEqual(p, before);
  assert.equal(removeTrack(p, "v1"), true);
  assert.deepEqual(p.assets, before.assets);
  assert.deepEqual(p.clips, [before.clips[1]]);
  assert.deepEqual(p.tracks, [before.tracks[1]]);
  validateProject({ version: 2, ...p });
});
test("rejects malformed loaded clips and missing assets", () => {
  assert.throws(() =>
    validateProject({
      version: 2,
      assets: [],
      tracks: [{ id: "v1" }],
      clips: [clip()],
    }),
  );
  assert.throws(() =>
    validateProject({
      version: 2,
      assets: [asset],
      tracks: [{ id: "v1" }],
      clips: [{ ...clip(), rate: 0 }],
    }),
  );
});
const gapProject = () => ({
  gaps: { enabled: true, speed: 50 },
  tracks: [
    { id: "v1", visible: true },
    { id: "f", visible: true },
  ],
  clips: [
    { ...makeClip({ type: "flight", duration: 600 }, "f", 0, "flight") },
    { ...clip(), start: 100 },
  ],
});
test("automatic gaps run 50x but preserve the full video at 1x", () => {
  const p = gapProject(),
    map = playbackIntervals(p);
  assert.deepEqual(map, [
    { start: 0, end: 100, rate: 50 },
    { start: 100, end: 120, rate: 1 },
    { start: 120, end: 600, rate: 50 },
  ]);
  assert.equal(outputDuration(map), 31.6);
  assert.equal(advancePlayback(map, 99, 0.04), 100.02);
  assert.equal(playbackRateAt(map, 100), 1);
  assert.equal(p.clips[1].start, 100);
});
test("moving a clip recalculates gaps and photos keep their display time", () => {
  const p = gapProject();
  p.clips[1].start = 250;
  p.clips.push({ ...clip(), id: "photo", kind: "photo", start: 300, out: 5 });
  const map = playbackIntervals(p);
  assert.equal(playbackRateAt(map, 100), 50);
  assert.equal(playbackRateAt(map, 260), 1);
  assert.equal(playbackRateAt(map, 303), 1);
  assert.equal(playbackRateAt(map, 305), 50);
});
test("200x gaps, disabled automation and manual flight tempo are respected", () => {
  const p = gapProject();
  p.gaps.speed = 200;
  assert.equal(playbackRateAt(playbackIntervals(p), 20), 200);
  p.gaps.enabled = false;
  assert.equal(outputDuration(playbackIntervals(p)), 600);
  p.gaps.enabled = true;
  p.clips[0].manualSpeed = true;
  assert.equal(playbackRateAt(playbackIntervals(p), 20), 1);
  const clips = editRange([clip()], 10, 30, 200);
  assert.equal(clips[0].rate, 200);
  assert.throws(() => editRange(clips, 10, 10.1, 2));
});
test("range output duration and advancement agree across adjacent videos", () => {
  const p = gapProject();
  p.clips.push({ ...clip(), start: 120, id: "b" });
  const map = playbackIntervals(p);
  assert.ok(Math.abs(outputDuration(map, 90, 150) - 40.4) < 1e-8);
  assert.ok(Math.abs(advancePlayback(map, 90, 40.4) - 150) < 1e-8);
});
