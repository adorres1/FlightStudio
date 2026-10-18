export class RecorderExporter {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.pending = 0;
  }
  status(s) {
    document.querySelector("#export-status").textContent = s;
  }
  async start({ format, size, audio, jobId }) {
    const app = this.app;
    if (!window.MediaRecorder)
      throw new Error("Bitte aktuellen Chrome oder Edge verwenden.");
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime)
      throw new Error(
        "Bitte aktuellen Chrome oder Edge für den Export verwenden.",
      );
    await app.engine.enableAudio();
    app.pause();
    this.previous = { time: app.time, speed: app.speed };
    this.format = format;
    this.error = null;
    this.finishing = false;
    this.cancelled = false;
    this.pending = 0;
    this.holdSince = null;
    this.queue = Promise.resolve();
    this.chunks = 0;
    this.jobId = jobId;
    this.startedRecording = false;
    app.size(size);
    app.speed = 1;
    app.seek(app.range[0]);
    app.render();
    // Explicit capture also works when Chromium's native window is hidden.
    this.stream = app.canvas.captureStream(0);
    this.videoTrack = this.stream.getVideoTracks()[0];
    if (audio)
      for (const t of app.engine.audio.destination.stream.getAudioTracks())
        this.stream.addTrack(t.clone());
    try {
      this.job = jobId
        ? { id: jobId }
        : await app.api("/api/exports", {
            method: "POST",
            body: JSON.stringify({ format }),
          });
      this.recorder = new MediaRecorder(this.stream, {
        mimeType: mime,
        videoBitsPerSecond: size >= 1080 ? 14000000 : 8000000,
      });
      this.stopped = new Promise((resolve) => (this.recorder.onstop = resolve));
      this.recorder.onerror = (e) => {
        this.error = e.error || new Error("Die Aufnahme ist fehlgeschlagen.");
      };
      this.recorder.ondataavailable = (e) => {
        if (!e.data.size || this.cancelled) return;
        const index = this.chunks++;
        this.pending++;
        this.queue = this.queue
          .then(() =>
            app.api(`/api/exports/${this.job.id}/chunks/${index}`, {
              method: "PUT",
              body: e.data,
              raw: true,
            }),
          )
          .catch((e) => {
            this.error = e;
          })
          .finally(() => this.pending--);
      };
      this.active = true;
      app.exporting = true;
      app.playing = true;
      document.body.classList.add("exporting");
      this.status("Medien und Karten werden vorbereitet …");
    } catch (e) {
      this.cleanup();
      throw e;
    }
  }
  frame(hold) {
    if (!this.active || this.finishing) return;
    if (this.error) {
      void this.fail(this.error);
      return;
    }
    const pause = hold || document.hidden || this.pending > 8;
    if (pause && !document.hidden) {
      this.holdSince ??= performance.now();
      if (performance.now() - this.holdSince > 60000) {
        void this.fail(
          new Error(
            "Medien oder Karten laden nicht vollständig. Bitte Verbindung oder Medienformat prüfen.",
          ),
        );
        return;
      }
    } else this.holdSince = null;
    if (!pause && !this.startedRecording) {
      this.recorder.start(1000);
      this.startedRecording = true;
    }
    if (pause && this.recorder.state === "recording") this.recorder.pause();
    if (!pause && this.recorder.state === "paused") this.recorder.resume();
    if (!pause) this.videoTrack.requestFrame();
    const progress =
      this.app.outputLength(this.app.range[0], this.app.time) /
      this.app.outputLength(...this.app.range);
    if (
      this.jobId &&
      (!this.lastReport || performance.now() - this.lastReport > 1000)
    ) {
      this.lastReport = performance.now();
      void this.app
        .api(`/api/exports/${this.jobId}/progress`, {
          method: "POST",
          body: JSON.stringify({ progress }),
        })
        .catch((e) => {
          this.error = e;
        });
    }
    document.querySelector("#export-progress").value = progress;
    this.status(
      pause
        ? "Warte auf Medien / Karte. Bitte diesen Tab sichtbar lassen."
        : `Film wird aufgezeichnet · ${Math.min(100, Math.round(progress * 100))} %`,
    );
  }
  async finish() {
    if (!this.active || this.finishing) return;
    this.finishing = true;
    this.app.pause();
    try {
      this.recorder.stop();
      await this.stopped;
      await this.queue;
      if (!this.chunks)
        throw new Error("Keine Videobilder aufgenommen. Bitte erneut starten.");
      if (this.error) throw this.error;
      if (this.cancelled) return;
      this.status("Aufzeichnung fertig. Ausgabedatei wird erstellt …");
      await this.app.api(`/api/exports/${this.job.id}/finish`, {
        method: "POST",
      });
      let job;
      do {
        await new Promise((r) => setTimeout(r, 500));
        if (this.cancelled) return;
        job = await this.app.api(`/api/exports/${this.job.id}`);
        if (job.status === "failed") throw new Error(job.error);
      } while (job.status !== "done");
      const link = document.querySelector("#export-download");
      link.href = job.url;
      link.download = "FlightStudio-V2." + this.format;
      link.hidden = false;
      const preview = document.querySelector("#export-result");
      preview.src = job.url;
      preview.hidden = false;
      document.querySelector("#export-progress").value = 1;
      this.status(
        "Fertig. Alle sichtbaren Ebenen und aktiven Tonspuren wurden zusammengefügt.",
      );
      this.cleanup();
    } catch (e) {
      await this.fail(e);
    }
  }
  async cancel() {
    if (!this.active) return;
    this.cancelled = true;
    this.app.pause();
    if (this.recorder.state !== "inactive") this.recorder.stop();
    if (this.startedRecording) await this.stopped;
    await this.queue;
    await this.app
      .api(`/api/exports/${this.job.id}/cancel`, { method: "POST" })
      .catch(() => {});
    this.cleanup();
    this.status("Export abgebrochen.");
  }
  async fail(e) {
    if (this.jobId) {
      await this.app
        .api(`/api/exports/${this.jobId}/fail`, {
          method: "POST",
          body: JSON.stringify({ error: e.message }),
        })
        .catch(() => {});
    }
    await this.cancel();
    this.app.toast(e.message, true);
    this.status("Export fehlgeschlagen: " + e.message);
  }
  cleanup() {
    this.active = false;
    this.finishing = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.app.exporting = false;
    this.app.pause();
    this.app.speed = this.previous?.speed || 1;
    this.app.size(720);
    document.body.classList.remove("exporting");
    document.querySelector("#export-start").disabled = false;
    document.querySelector("#export-close").disabled = false;
    document.querySelector("#export-cancel").hidden = true;
  }
}
