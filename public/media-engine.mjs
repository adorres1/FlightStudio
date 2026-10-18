import { sourceTime, fade, clamp, active } from "/lib/timeline.mjs";
export class MediaEngine {
  constructor(onError, silent = false) {
    this.elements = new Map();
    this.onError = onError;
    this.silent = silent;
  }
  async enableAudio() {
    if (!this.audio) {
      const context = new AudioContext(),
        destination = context.createMediaStreamDestination(),
        master = context.createDynamicsCompressor();
      const speaker = context.createGain();
      speaker.gain.value = this.silent ? 0 : 1;
      master.connect(speaker);
      speaker.connect(context.destination);
      master.connect(destination);
      this.audio = { context, destination, master };
      for (const item of this.elements.values()) this.connect(item);
    }
    if (this.audio.context.state === "suspended")
      await this.audio.context.resume();
  }
  connect(item) {
    if (item.kind === "photo" || item.source || !this.audio) return;
    item.source = this.audio.context.createMediaElementSource(item.el);
    item.gain = this.audio.context.createGain();
    item.gain.gain.value = 0;
    item.source.connect(item.gain);
    item.gain.connect(this.audio.master);
    item.el.muted = false;
  }
  get(c, asset) {
    let item = this.elements.get(c.id);
    if (item && item.assetId === asset.id) return item;
    if (item) {
      item.el.pause?.();
      item.source?.disconnect();
      item.gain?.disconnect();
    }
    const el = document.createElement(
      c.kind === "photo" ? "img" : c.kind === "audio" ? "audio" : "video",
    );
    item = { el, kind: c.kind, assetId: asset.id, error: false };
    this.elements.set(c.id, item);
    el.preload = "auto";
    el.playsInline = true;
    el.muted = true;
    el.onerror = () => {
      item.error = true;
      this.onError(
        "„" +
          asset.name +
          "“ kann im Browser nicht abgespielt werden. Für Video bitte MP4 mit H.264/AAC verwenden.",
      );
    };
    el.src = asset.url;
    this.connect(item);
    return item;
  }
  sync(state, time, playing, speed, wait = false) {
    let hold = false;
    const activeIds = new Set();
    const assets = new Map(state.assets.map((a) => [a.id, a])),
      tracks = new Map(state.tracks.map((t) => [t.id, t]));
    for (const c of state.clips) {
      if (!["video", "photo", "audio"].includes(c.kind) || !active(c, time))
        continue;
      const asset = assets.get(c.assetId);
      if (!asset) continue;
      const track = tracks.get(c.trackId);
      if (!track || (!track.visible && c.kind === "photo")) continue;
      activeIds.add(c.id);
      const item = this.get(c, asset),
        el = item.el;
      if (item.error) continue;
      if (c.kind === "photo") {
        hold ||= !el.complete;
        continue;
      }
      if (el.readyState < 1) {
        hold = true;
        continue;
      }
      const desired = clamp(
          sourceTime(c, time),
          0,
          Math.max(0, asset.duration - 0.003),
        ),
        rate = c.rate * speed,
        natural = rate >= 0.0625 && rate <= 16;
      if (
        !el.seeking &&
        Math.abs(el.currentTime - desired) > (playing && natural ? 0.08 : 0.008)
      )
        el.currentTime = desired;
      el.playbackRate = clamp(rate, 0.0625, 16);
      if (item.gain)
        item.gain.gain.value =
          playing && !track.muted && rate <= 4 && !wait
            ? (c.volume ?? 1) * fade(c, time)
            : 0;
      const ready = !el.seeking && el.readyState >= 3;
      hold ||= !ready;
      if (playing && natural && !wait && ready) {
        if (el.paused)
          el.play().catch((e) => {
            if (e.name !== "AbortError")
              this.onError(
                "Wiedergabe wurde blockiert. Bitte Play erneut drücken.",
              );
          });
      } else el.pause();
    }
    for (const [id, item] of this.elements)
      if (!activeIds.has(id)) {
        item.el.pause?.();
        if (item.gain) item.gain.gain.value = 0;
      }
    return hold;
  }
  pause() {
    for (const item of this.elements.values()) {
      item.el.pause?.();
      if (item.gain) item.gain.gain.value = 0;
    }
  }
  prune(clips) {
    const ids = new Set(clips.map((c) => c.id));
    for (const [id, item] of this.elements)
      if (!ids.has(id)) {
        item.el.pause?.();
        item.el.removeAttribute("src");
        item.el.load?.();
        item.source?.disconnect();
        item.gain?.disconnect();
        this.elements.delete(id);
      }
  }
}
