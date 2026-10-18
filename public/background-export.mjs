import { translate as t, getLanguage } from "./i18n.mjs";
const $ = (id) => document.getElementById(id);
const running = (j) => ["queued", "recording", "encoding"].includes(j.status);
const labels = {
  queued: "Wird vorbereitet",
  recording: "Filmbilder werden erstellt",
  encoding: "Videodatei wird erstellt",
  done: "Fertig",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};
export class BackgroundExporter {
  constructor(app) {
    this.app = app;
    // active is reserved for the visible recorder; this export never drives the editor.
    this.active = false;
    this.pending = 0;
    this.background = true;
    this.timer = setInterval(() => {
      void this.refresh().catch(() => {});
    }, 1500);
  }
  async start(options) {
    this.app.pause();
    const job = await this.app.api("/api/exports", {
      method: "POST",
      body: JSON.stringify({
        ...options,
        project: this.app.project(),
        range: [...this.app.range],
      }),
    });
    this.jobId = job.id;
    $("export-close").disabled = false;
    await this.refresh();
    this.app.toast(
      "Export im Hintergrund gestartet. Du kannst das Editorfenster schliessen.",
    );
  }
  async refresh() {
    const jobs = await this.app.api("/api/exports");
    const current =
      jobs.find(running) || jobs.find((j) => j.id === this.jobId) || jobs[0];
    const active = jobs.some(running);
    $("export-start").disabled = active;
    $("export-close").disabled = false;
    $("export-cancel").hidden = !active;
    $("export-open").textContent = active
      ? `Export ${Math.round((current?.progress || 0) * 100)} % ↗`
      : "Exportieren ↗";
    if (current) {
      this.jobId = current.id;
      $("export-progress").hidden = false;
      $("export-progress").value = current.progress;
      $("export-status").textContent =
        `${labels[current.status]}${running(current) ? ` · ${Math.round(current.progress * 100)} % · Du kannst dieses Fenster schliessen.` : ""}${current.error ? ": " + current.error : ""}`;
      const link = $("export-download");
      link.hidden = !current.url;
      if (current.url) {
        link.href = current.url;
        link.download = "FlightStudio-V2." + current.format;
        const preview = $("export-result");
        if (preview.getAttribute("src") !== current.url)
          preview.src = current.url;
        preview.hidden = false;
      } else {
        $("export-result").hidden = true;
      }
    }
    const host = $("export-history");
    host.replaceChildren();
    for (const job of jobs.slice(0, 20)) {
      const row = document.createElement("article"),
        text = document.createElement("span");
      text.setAttribute("translate", "no");
      text.textContent = `${new Date(job.created).toLocaleString(getLanguage() === "en" ? "en-GB" : "de-CH")} · ${job.name} · ${t(labels[job.status])}`;
      row.append(text);
      if (job.url) {
        const a = document.createElement("a");
        a.textContent = job.format.toUpperCase() + " speichern ↓";
        a.href = job.url;
        a.download = "FlightStudio-" + job.id.slice(0, 8) + "." + job.format;
        row.append(a);
      }
      host.append(row);
    }
  }
  async cancel() {
    if (this.jobId)
      await this.app.api(`/api/exports/${this.jobId}/cancel`, {
        method: "POST",
      });
    await this.refresh();
  }
}
