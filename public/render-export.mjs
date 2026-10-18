import {
  playbackIntervals,
  outputDuration,
  advancePlayback,
} from "/lib/timeline.mjs";
import { qualities } from "/lib/export-settings.mjs";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Each frame is sampled at its exact output time. Window visibility and CPU speed
// affect render duration, never the movie clock or the alignment of its audio.
export async function renderExport(app, scene, id) {
  const intervals = playbackIntervals(app.state),
    duration = outputDuration(intervals, ...scene.range),
    fps = scene.options.fps || 30,
    total = Math.ceil(duration * fps);
  app.pause();
  app.exporting = true;
  app.size(scene.options.size);
  let reportAt = 0;
  try {
    for (let frame = 0; frame < total; frame++) {
      app.time = advancePlayback(intervals, scene.range[0], frame / fps);
      const started = performance.now();
      while (app.render()) {
        if (app.mediaError) throw new Error(app.mediaError);
        if (performance.now() - started > 90000)
          throw new Error(
            "Medien oder Karten konnten nicht vollständig geladen werden.",
          );
        if (performance.now() - reportAt > 1500) {
          reportAt = performance.now();
          await app.api(`/api/exports/${id}/progress`, {
            method: "POST",
            body: JSON.stringify({ progress: frame / total }),
          });
        }
        await wait(16);
      }
      if (app.mediaError) throw new Error(app.mediaError);
      const blob = await new Promise((resolve, reject) =>
        app.canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("Exportbild konnte nicht erstellt werden.")),
          "image/jpeg",
          qualities[scene.options.quality || "standard"].jpeg,
        ),
      );
      await app.api(`/api/exports/${id}/frames/${frame}`, {
        method: "PUT",
        body: blob,
        raw: true,
      });
    }
    await app.api(`/api/exports/${id}/finish`, { method: "POST" });
  } catch (error) {
    await app
      .api(`/api/exports/${id}/fail`, {
        method: "POST",
        body: JSON.stringify({ error: error.message }),
      })
      .catch(() => {});
  }
}
