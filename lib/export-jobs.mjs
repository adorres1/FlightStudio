import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { audioSegments, audioFilter } from "./audio-plan.mjs";
import { VideoDecoder } from "./video-decoder.mjs";
import { VideoEncoder, encoderArgs, encoderLabel } from "./video-encoder.mjs";
import { exportSettings, qualities } from "./export-settings.mjs";
import {
  active, sourceTime, advancePlayback,
  validateProject,
  sequenceDuration,
  playbackIntervals,
  outputDuration,
} from "./timeline.mjs";

const activeStates = new Set(["queued", "recording", "encoding"]);
const validId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/;

// A job owns a frozen project snapshot. The editor can close or change independently.
export class ExportJobs extends EventEmitter {
  constructor(directory, ffmpeg, getMedia) {
    super();
    this.directory = directory;
    this.ffmpeg = ffmpeg;
    this.getMedia = getMedia;
    this.encoder = new VideoEncoder(ffmpeg);
    this.creating = false;
    this.jobs = new Map();
    this.launch = null;
    this.saves = new Map();
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    for (const name of await fs.readdir(this.directory)) {
      if (!name.endsWith(".job.json")) continue;
      try {
        const job = JSON.parse(
          await fs.readFile(path.join(this.directory, name), "utf8"),
        );
        if (!validId.test(job.id)) continue;
        job.source = path.join(this.directory, job.id + ".part");
        job.output = path.join(this.directory, job.id + "." + job.format);
        if (activeStates.has(job.status)) {
          job.status = "failed";
          job.error =
            "Der Hintergrundprozess wurde beendet. Bitte den Export erneut starten.";
        }
        this.jobs.set(job.id, job);
        await this.save(job);
      } catch {
        /* A partial metadata file must not prevent the editor starting. */
      }
    }
    this.timer = setInterval(() => {
      for (const job of this.jobs.values()) {
        if (
          ["queued", "recording"].includes(job.status) &&
          Date.now() - job.heartbeat > 90000
        )
          void this.fail(
            job.id,
            "Der Exportprozess antwortet nicht mehr. Bitte erneut starten.",
          );
      }
    }, 10000);
    this.timer.unref();
  }
  get active() {
    return [...this.jobs.values()].filter((j) => activeStates.has(j.status));
  }
  public(job) {
    return {
      id: job.id,
      name: job.name,
      created: job.created,
      status: job.status,
      format: job.format,
      bytes: job.bytes,
      progress: job.progress || 0,
      error: job.error,
      background: job.background,
      duration: job.duration,
      fps: job.fps || 30,
      quality: job.quality || "standard",
      size: job.size,
      encoder: job.encoder,
      encoderLabel: job.encoder ? encoderLabel(job.encoder) : null,
      url: job.status === "done" ? `/api/exports/${job.id}/file` : null,
    };
  }
  list() {
    return [...this.jobs.values()]
      .sort((a, b) => b.created - a.created)
      .map((j) => this.public(j));
  }
  get(id) {
    const job = this.jobs.get(id);
    if (!job)
      throw Object.assign(new Error("Export nicht gefunden."), { status: 404 });
    return job;
  }
  save(job) {
    const value = { ...this.public(job), chunks: job.chunks };
    const previous = this.saves.get(job.id) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const target = path.join(this.directory, job.id + ".job.json");
        await fs.writeFile(target + ".tmp", JSON.stringify(value));
        await fs.rename(target + ".tmp", target);
      });
    this.saves.set(job.id, next);
    return next;
  }
  async changed(job) {
    await this.save(job);
    this.emit("change", this.public(job));
  }
  async create(opts) {
    if (this.creating) throw new Error("Ein Export wird bereits vorbereitet.");
    this.creating = true;
    try { return await this.createJob(opts); }
    finally { this.creating = false; }
  }
  async createJob(opts) {
    if (!["mp4", "webm"].includes(opts.format))
      throw new Error("Unbekanntes Exportformat.");
    if (this.active.length)
      throw new Error(
        "Ein Export läuft bereits. Bitte warten oder diesen abbrechen.",
      );
    const background = Boolean(opts.project);
    let scene;
    if (background) {
      if (!this.launch)
        throw new Error("Hintergrundexport benötigt die Desktop-App.");
      const project = validateProject(structuredClone(opts.project));
      // Never accept arbitrary media URLs from a submitted project.
      project.assets = await Promise.all(
        project.assets.map(async (a) => {
          const local = await this.getMedia(a.id);
          return {
            ...a,
            ...local,
            duration:
              local.type === "photo"
                ? Math.max(local.duration, a.duration)
                : local.duration,
          };
        }),
      );
      const range = opts.range;
      if (
        !Array.isArray(range) ||
        range.length !== 2 ||
        !range.every(Number.isFinite) ||
        range[0] < 0 ||
        range[1] <= range[0] ||
        range[1] > sequenceDuration(project.clips) + 0.001
      )
        throw new Error("Ungültiger Exportbereich.");
      scene = {
        project,
        range,
        options: exportSettings(opts),
      };
    }
    const encoder = scene ? await this.encoder.select(scene.options, scene.project.aspect || "16:9") : null;
    const id = randomUUID();
    const job = {
      id,
      created: Date.now(),
      heartbeat: Date.now(),
      name: scene?.project.name || "FlightStudio-Film",
      status: background ? "queued" : "recording",
      format: opts.format,
      background,
      encoder,
      fps: scene?.options.fps || 30,
      quality: scene?.options.quality || "standard",
      size: scene?.options.size,
      chunks: 0,
      bytes: 0,
      progress: 0,
      duration: scene
        ? outputDuration(playbackIntervals(scene.project), ...scene.range)
        : null,
      source: path.join(this.directory, id + ".part"),
      output: path.join(this.directory, id + "." + opts.format),
    };
    if (scene) { job.sceneData = scene; job.decoders = new Map(); }
    if (scene)
      await fs.writeFile(
        path.join(this.directory, id + ".scene.json"),
        JSON.stringify(scene),
      );
    this.jobs.set(id, job);
    await this.changed(job);
    if (background) {
      try {
        job.worker = await this.launch(id);
      } catch (error) {
        await this.fail(
          id,
          "Exportprozess konnte nicht starten: " + error.message,
        );
      }
    }
    return this.public(job);
  }
  async scene(id) {
    const job = this.get(id);
    if (!job.background || !["queued", "recording"].includes(job.status))
      throw new Error("Export ist nicht mehr aktiv.");
    job.status = "recording";
    job.heartbeat = Date.now();
    await this.changed(job);
    return JSON.parse(
      await fs.readFile(path.join(this.directory, id + ".scene.json"), "utf8"),
    );
  }
  async chunk(id, index, data) {
    const job = this.get(id);
    if (job.status !== "recording" || index !== job.chunks || job.writing)
      throw new Error("Ungültige Reihenfolge der Exportblöcke.");
    job.writing = true;
    try {
      await fs.appendFile(job.source, data);
      job.bytes += data.length;
      job.chunks++;
      job.heartbeat = Date.now();
    } finally {
      job.writing = false;
    }
  }
  async progress(id, value) {
    const job = this.get(id);
    if (!activeStates.has(job.status)) return;
    job.heartbeat = Date.now();
    job.progress = Math.max(0, Math.min(0.99, Number(value) || 0));
    await this.changed(job);
  }
  stopDecoders(job) {
    for (const decoder of job.decoders?.values() || []) decoder.stop();
    job.decoders?.clear();
  }
  async mediaFrame(id, clipId, frame) {
    const job = this.get(id), scene = job.sceneData;
    if (job.status !== "recording" || !scene || !Number.isInteger(frame) || frame < 0 ||
        frame >= Math.ceil(job.duration * job.fps)) throw new Error("Invalid export video frame");
    const time = advancePlayback(playbackIntervals(scene.project), scene.range[0], frame / job.fps);
    const visible = scene.project.clips.filter(c => c.kind === "video" && active(c, time) &&
      scene.project.tracks.some(t => t.id === c.trackId && t.visible));
    const clip = visible.find(c => c.id === clipId);
    if (!clip) throw new Error("Video clip is not visible at this export time");
    for (const [key, decoder] of job.decoders) if (!visible.some(c => c.id === key)) {
      decoder.stop(); job.decoders.delete(key);
    }
    let decoder = job.decoders.get(clip.id);
    const asset = scene.project.assets.find(a => a.id === clip.assetId);
    if (!decoder) {
      decoder = new VideoDecoder(this.ffmpeg, path.join(path.dirname(this.directory), "media", asset.filename));
      job.decoders.set(clip.id, decoder);
    }
    job.heartbeat = Date.now();
    return decoder.frame(Math.min(sourceTime(clip, time), Math.max(0, asset.duration - .003)));
  }
  async frame(id, index, data) {
    const job = this.get(id);
    if (
      !job.background ||
      job.status !== "recording" ||
      index !== (job.frames || 0) ||
      job.writing
    )
      throw new Error("Ungültige Reihenfolge der Exportbilder.");
    job.writing = true;
    try {
      if (!job.child) {
        // 60000 ticks divide all supported frame rates exactly. Matroska's
        // millisecond timestamps introduce alternating 16/17 ms frames at 60 fps.
        job.video = path.join(this.directory, id + ".video." + job.format);
        const child = spawn(
          this.ffmpeg,
          [
            "-y",
            "-v",
            "error",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-framerate",
            String(job.fps),
            "-i",
            "pipe:0",
            "-an",
            // Canvas JPEGs use full-range BT.601. Explicitly convert before
            // H.264/VP9 encoding; GPU defaults may otherwise label them BT.709.
            "-vf", "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=tv",
            ...encoderArgs(job.encoder, job.quality),
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
            "-pix_fmt",
            "yuv420p",
            ...(job.format === "mp4" ? ["-video_track_timescale", "60000"] : []),
            job.video,
          ],
          { windowsHide: true },
        );
        job.child = child;
        let error = "";
        child.stderr.on("data", (d) => (error = (error + d).slice(-2000)));
        job.encoded = new Promise((resolve, reject) => {
          child.on("error", reject);
          child.on("close", (code) =>
            code === 0
              ? resolve()
              : reject(
                  new Error(
                    error || "Videobilder konnten nicht kodiert werden.",
                  ),
                ),
          );
        });
        job.encoded.catch(() => {});
        child.stdin.on("error", () => {});
      }
      await new Promise((resolve, reject) =>
        job.child.stdin.write(data, (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      job.frames = (job.frames || 0) + 1;
      job.bytes += data.length;
      job.heartbeat = Date.now();
      job.progress = Math.min(0.98, job.frames / Math.ceil(job.duration * job.fps));
      if (job.frames % job.fps === 0) await this.changed(job);
    } finally {
      job.writing = false;
    }
  }
  async finishFrames(job) {
    if (
      job.status !== "recording" ||
      job.writing ||
      job.frames !== Math.ceil(job.duration * job.fps)
    )
      throw new Error("Exportbilder sind noch nicht vollständig.");
    job.status = "encoding";
    await this.changed(job);
    this.stopDecoders(job);
    job.child.stdin.end();
    void (async () => {
      await job.encoded;
      if (job.status !== "encoding") return;
      const scene = JSON.parse(
        await fs.readFile(
          path.join(this.directory, job.id + ".scene.json"),
          "utf8",
        ),
      );
      const segments = scene.options.audio
          ? audioSegments(scene.project, scene.range)
          : [],
        ids = [...new Set(segments.map((s) => s.assetId))];
      const args = ["-y", "-v", "error", "-i", job.video];
      for (const id of ids) {
        const asset = await this.getMedia(id);
        args.push(
          "-i",
          path.join(path.dirname(this.directory), "media", asset.filename),
        );
      }
      if (segments.length) {
        const file = path.join(this.directory, job.id + ".audio-filter.txt");
        await fs.writeFile(file, audioFilter(segments, ids, job.duration));
        args.push(
          "-filter_complex_script",
          file,
          "-map",
          "0:v:0",
          "-map",
          "[mix]",
        );
      } else args.push("-map", "0:v:0", "-an");
      args.push(
        ...(job.format === "mp4"
          ? [
              "-c:v",
              "copy",
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              "-movflags",
              "+faststart",
            ]
          : [
              "-c:v",
              "copy",
              "-c:a",
              "libopus",
            ]),
      );
      args.push("-t", String(job.duration), job.output);
      const child = spawn(this.ffmpeg, args, { windowsHide: true });
      job.child = child;
      let error = "";
      child.stderr.on("data", (d) => (error = (error + d).slice(-2000)));
      await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  error || "Ton und Bild konnten nicht verbunden werden.",
                ),
              ),
        );
      });
      if (job.status !== "encoding") return;
      job.status = "done";
      job.progress = 1;
      await this.changed(job);
      job.worker?.stop();
      await fs.rm(job.video, { force: true });
      await fs.rm(path.join(this.directory, job.id + ".audio-filter.txt"), {
        force: true,
      });
    })().catch((error) => this.fail(job.id, error.message));
  }
  async finish(id) {
    const job = this.get(id);
    if (job.background) return this.finishFrames(job);
    if (job.status !== "recording" || !job.chunks || job.writing)
      throw new Error("Export noch nicht vollständig.");
    job.status = "encoding";
    await this.changed(job);
    // Always remux WebM too: MediaRecorder files otherwise lack a seekable duration.
    const args = [
      "-y",
      "-v",
      "error",
      "-i",
      job.source,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
    ];
    args.push(
      ...(job.format === "mp4"
        ? [
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
          ]
        : ["-c", "copy"]),
    );
    args.push(job.output);
    const child = spawn(this.ffmpeg, args, { windowsHide: true });
    job.child = child;
    let error = "";
    child.stderr.on("data", (d) => (error = (error + d).slice(-2000)));
    child.on("error", (e) => {
      void this.fail(
        id,
        "Videodatei konnte nicht erstellt werden: " + e.message,
      );
    });
    child.on("close", (code) => {
      void (async () => {
        if (job.status !== "encoding") return;
        if (code !== 0) {
          await this.fail(id, error || "Videokonvertierung fehlgeschlagen.");
          return;
        }
        job.status = "done";
        job.progress = 1;
        await fs.rm(job.source, { force: true });
        await this.changed(job);
        job.worker?.stop();
      })().catch((e) => this.fail(id, e.message));
    });
  }
  async fail(id, message) {
    const job = this.get(id);
    if (!activeStates.has(job.status)) return;
    job.status = "failed";
    this.stopDecoders(job);
    job.error = String(message).slice(0, 2000);
    job.child?.kill();
    job.worker?.stop();
    await this.changed(job);
  }
  async cancel(id) {
    const job = this.get(id);
    if (!activeStates.has(job.status)) return;
    job.status = "cancelled";
    this.stopDecoders(job);
    job.child?.kill();
    job.worker?.stop();
    await this.changed(job);
  }
}
