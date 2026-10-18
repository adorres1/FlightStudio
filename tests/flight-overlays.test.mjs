import { test } from "node:test";
import assert from "node:assert/strict";
import { makeOverlay, overlayTime, flightReadouts, readoutRect } from "../lib/flight-overlays.mjs";
import { parseIGC, sampleFlight } from "../lib/flight.mjs";
import { validateProject, makeClip, splitClip } from "../lib/timeline.mjs";
import fs from "node:fs";
test("multiple flights share UTC or aligned starts with a signed time offset", () => {
  const primary = { start: 100000 },
    other = { start: 125000 };
  const overlay = makeOverlay(other, 0, "b");
  assert.equal(overlayTime(overlay, primary, 110000), 110000);
  overlay.alignment = "start";
  assert.equal(overlayTime(overlay, primary, 110000), 135000);
  overlay.offsetSeconds = 5;
  assert.equal(overlayTime(overlay, primary, 110000), 130000);
  overlay.offsetSeconds = -5;
  assert.equal(overlayTime(overlay, primary, 110000), 140000);
  assert.notEqual(
    makeOverlay(other, 0, "b").color,
    makeOverlay(other, 1, "c").color,
  );
});
test("colored readouts use each flight's aligned clock and omit hidden flights", () => {
  const primary = parseIGC(fs.readFileSync(new URL("../examples/Demo-Flug.igc", import.meta.url), "utf8"));
  const second = parseIGC(fs.readFileSync(new URL("../examples/Demo-Flug-B.igc", import.meta.url), "utf8"));
  const overlay = makeOverlay(second, 0, "b"), time = primary.start + 60000;
  let rows = flightReadouts(primary, [overlay], time);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].color, "#f28143");
  assert.equal(rows[1].color, overlay.color);
  assert.deepEqual(rows[1].sample, sampleFlight(second, time));
  overlay.alignment = "start";
  overlay.offsetSeconds = 5;
  rows = flightReadouts(primary, [overlay], time);
  assert.deepEqual(rows[1].sample, sampleFlight(second, second.start + 55000));
  assert.equal(flightReadouts(primary, [overlay], primary.start)[1].sample, null);
  overlay.visible = false;
  assert.equal(flightReadouts(primary, [overlay], time).length, 1);
  assert.deepEqual(flightReadouts(null, [overlay], time), []);
});
test("readout placement survives saving and splitting a flight clip", () => {
  const flight = parseIGC(fs.readFileSync(new URL("../examples/Demo-Flug.igc", import.meta.url), "utf8"));
  const clip = makeClip({ type: "flight", duration: 10 }, "flight", 0, "f");
  const initial = readoutRect(clip, 2);
  assert.ok(initial.x < .05 && initial.y < .05);
  clip.statsRect = { x: .1, y: .7, w: .6, h: .2 };
  const project = validateProject(JSON.parse(JSON.stringify({ version: 2, assets: [], flight, tracks: [{ id: "flight" }], clips: [clip] })));
  assert.deepEqual(readoutRect(project.clips[0], 2), clip.statsRect);
  const parts = splitClip(project.clips[0], 4);
  assert.equal(parts.length, 2);
  for (const part of parts) assert.deepEqual(readoutRect(part, 2), clip.statsRect);
});
test("a second IGC survives project serialization without adding a map clip", () => {
  const primary = parseIGC(
    fs.readFileSync(
      new URL("../examples/Demo-Flug.igc", import.meta.url),
      "utf8",
    ),
  );
  const second = parseIGC(
    fs.readFileSync(
      new URL("../examples/Demo-Flug-B.igc", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(second.start - primary.start, 20000);
  const p = {
    version: 2,
    assets: [],
    tracks: [{ id: "flight" }],
    flight: primary,
    flightOverlays: [makeOverlay(second, 0, "b")],
    clips: [makeClip({ type: "flight", duration: 1440 }, "flight", 0, "main")],
  };
  const restored = validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.clips.length, 1);
  assert.equal(restored.flightOverlays.length, 1);
  assert.equal(restored.flightOverlays[0].flight.points.length, 721);
  restored.flightOverlays[0].color = "invalid";
  assert.throws(() => validateProject(restored));
});
