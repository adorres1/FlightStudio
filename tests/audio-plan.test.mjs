import { test } from "node:test";
import assert from "node:assert/strict";
import { audioSegments, atempo, audioFilter } from "../lib/audio-plan.mjs";
test("audio uses source trims, output placement, per-clip tempo, mute and auto-compressed gaps", () => {
  const p = {
    assets: [{ id: "a", audio: true }],
    tracks: [
      { id: "f", visible: true },
      { id: "v", visible: true },
    ],
    gaps: { enabled: true, speed: 50 },
    clips: [
      {
        id: "f",
        kind: "flight",
        trackId: "f",
        start: 0,
        in: 0,
        out: 100,
        rate: 1,
      },
      {
        id: "v",
        assetId: "a",
        kind: "video",
        trackId: "v",
        start: 50,
        in: 10,
        out: 30,
        rate: 2,
        volume: 0.5,
        fadeIn: 1,
      },
    ],
  };
  const [s] = audioSegments(p, [0, 100]);
  assert.equal(s.at, 1);
  assert.equal(s.sourceStart, 10);
  assert.equal(s.sourceEnd, 30);
  assert.equal(s.duration, 10);
  assert.equal(s.rate, 2);
  const [cut] = audioSegments(p, [52, 56]);
  assert.equal(cut.sourceStart, 14);
  assert.equal(cut.sourceEnd, 22);
  assert.equal(cut.at, 0);
  assert.equal(cut.duration, 4);
  assert.match(audioFilter([s], ["a"], 11.8), /adelay=1000:all=1/);
  assert.match(atempo(0.125), /atempo=0.5,atempo=0.5,atempo=0.50000000/);
  p.tracks[1].muted = true;
  assert.equal(audioSegments(p, [0, 100]).length, 0);
  p.tracks[1].muted = false;
  p.clips[1].rate = 10;
  assert.equal(audioSegments(p, [0, 100]).length, 0);
});
