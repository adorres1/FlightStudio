import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ExportJobs } from "../lib/export-jobs.mjs";
import {
  clipMapSettings,
  splitClip,
  makeClip,
  playbackIntervals,
  outputDuration,
  validateProject,
} from "../lib/timeline.mjs";

test("normal playback is the default, 50x and 200x require opt-in", () => {
  const p = {
    tracks: [{ id: "f", visible: true }],
    clips: [makeClip({ type: "flight", duration: 600 }, "f", 0, "flight")],
  };
  assert.equal(outputDuration(playbackIntervals(p)), 600);
  p.gaps = { enabled: false, speed: 50 };
  assert.equal(outputDuration(playbackIntervals(p)), 600);
  p.gaps.enabled = true;
  assert.equal(outputDuration(playbackIntervals(p)), 12);
  p.gaps.speed = 200;
  assert.equal(outputDuration(playbackIntervals(p)), 3);
});
test("split flight sections preserve independently changeable map styles and transparency", () => {
  const original = {
    ...makeClip({ type: "flight", duration: 120 }, "f", 0, "flight"),
    mapStyle: "overlay",
    mapOpacity: 0.35,
  };
  const [a, b] = splitClip(original, 60, "second");
  b.mapStyle = "satellite";
  const defaults = { style: "relief", opacity: 0.65, camera: "follow" };
  assert.deepEqual(clipMapSettings(defaults, a), {
    style: "overlay",
    opacity: 0.35,
    camera: "follow",
  });
  assert.equal(clipMapSettings(defaults, b).style, "satellite");
  assert.equal(
    clipMapSettings(defaults, { mapStyle: "inherit" }).style,
    "relief",
  );
  const project = {
    version: 2,
    assets: [],
    tracks: [{ id: "f" }],
    flight: { start: 0, end: 120000 },
    clips: [a, b],
  };
  validateProject(project);
  a.mapStyle = "invalid";
  assert.throws(() => validateProject(project));
});
test("background jobs freeze projects, canonicalize media, persist and reject duplicate or invalid jobs", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "flightstudio-jobs-"),
  );
  const media = {
    id: "asset",
    url: "/media/asset",
    type: "video",
    duration: 4,
  };
  const manager = new ExportJobs(directory, "unused", async () => media);
  await manager.init();
  t.after(() => clearInterval(manager.timer));
  let stopped = false;
  manager.launch = async () => ({
    stop() {
      stopped = true;
    },
  });
  const project = {
    version: 2,
    name: "Snapshot",
    assets: [{ ...media, url: "https://invalid.test/video" }],
    tracks: [{ id: "v", visible: true }],
    clips: [makeClip(media, "v", 0, "clip")],
  };
  const opts = {
    format: "mp4",
    size: 720,
    audio: true,
    range: [0, 3],
    project,
  };
  const job = await manager.create(opts);
  project.name = "Changed later";
  const scene = await manager.scene(job.id);
  assert.equal(scene.project.name, "Snapshot");
  assert.equal(scene.project.assets[0].url, "/media/asset");
  await assert.rejects(() => manager.create(opts), /bereits/);
  await manager.progress(job.id, 0.5);
  await manager.cancel(job.id);
  assert.equal(stopped, true);
  const reopened = new ExportJobs(directory, "unused", async () => media);
  await reopened.init();
  t.after(() => clearInterval(reopened.timer));
  assert.equal(reopened.list()[0].status, "cancelled");
  assert.equal(reopened.list()[0].progress, 0.5);
  await assert.rejects(
    () => manager.create({ ...opts, range: [0, 10] }),
    /Exportbereich/,
  );
  const unfinished = await manager.create(opts);
  const restarted = new ExportJobs(directory, "unused", async () => media);
  await restarted.init();
  t.after(() => clearInterval(restarted.timer));
  assert.equal(restarted.get(unfinished.id).status, "failed");
});
