const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  dialog,
  shell,
  Notification,
  powerSaveBlocker,
  ipcMain,
  net,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const workerIndex = process.argv.indexOf("--render-worker");
const workerUrl = workerIndex >= 0 ? process.argv[workerIndex + 1] : null;
app.setName("FlightStudio V2");
if (!workerUrl)
  app.setPath("userData", process.env.FLIGHTSTUDIO_PROFILE_DIR
    ? path.resolve(process.env.FLIGHTSTUDIO_PROFILE_DIR)
    : path.join(app.getPath("appData"), "FlightStudio-V2"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.setAppUserModelId("ch.flightstudio.v2");
let editor,
  tray,
  manager,
  baseUrl,
  blocker,
  quitting = false;
const renderWindows = new Set();
const iconPath = path.join(root, "desktop", "icon.png");
let language = "de", english = {};
const tr = (text) => language === "en" ? english[text] || text : text;

function updateMenu() {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: tr("FlightStudio"),
            submenu: [
              {
                label: tr("Exportordner öffnen"),
                click: () => void shell.openPath(manager.directory),
              },
              {
                label: tr("Programmdaten öffnen"),
                click: () =>
                  void shell.openPath(process.env.FLIGHTSTUDIO_DATA_DIR),
              },
              { type: "separator" },
              { label: tr("Beenden"), click: () => app.quit() },
            ],
          },
          {
            label: tr("Bearbeiten"),
            submenu: [
              { role: "undo", label: tr("Rückgängig") },
              { role: "redo", label: tr("Wiederholen") },
              { type: "separator" },
              { role: "cut", label: tr("Ausschneiden") },
              { role: "copy", label: tr("Kopieren") },
              { role: "paste", label: tr("Einfügen") },
              { role: "selectAll", label: tr("Alles auswählen") },
            ],
          },
          {
            label: tr("Ansicht"),
            submenu: [
              { role: "resetZoom", label: tr("Originalgrösse") },
              { role: "zoomIn", label: tr("Vergrössern") },
              { role: "zoomOut", label: tr("Verkleinern") },
              { role: "togglefullscreen", label: tr("Vollbild umschalten") },
            ],
          },
        ]),
      );
}

function secureWindow(win, origin, external = false) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (external && /^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
}
function renderer(url, ended) {
  const win = new BrowserWindow({
    show: false,
    width: 1366,
    height: 900,
    icon: iconPath,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: true,
      paintWhenInitiallyHidden: true,
      partition: "export-" + new URL(url).searchParams.get("renderJob"),
    },
  });
  secureWindow(win, new URL(url).origin);
  win.webContents.setFrameRate(30);
  renderWindows.add(win);
  win.webContents.on("render-process-gone", (_e, details) =>
    ended("Exportprozess beendet: " + details.reason),
  );
  win.webContents.on(
    "did-fail-load",
    (_e, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3)
        ended("Exportfenster konnte nicht laden: " + description);
    },
  );
  win.on("closed", () => renderWindows.delete(win));
  void win.loadURL(url).catch((e) => ended(e.message));
  return win;
}
function showEditor() {
  if (editor && !editor.isDestroyed()) {
    editor.show();
    editor.restore();
    editor.focus();
    return;
  }
  editor = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 900,
    minHeight: 650,
    title: tr("FlightStudio V2"),
    icon: iconPath,
    backgroundColor: "#f4f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  secureWindow(editor, baseUrl, true);
  editor.on("close", (event) => {
    if (!quitting && manager.active.length) {
      event.preventDefault();
      editor.hide();
      if (Notification.isSupported())
        new Notification({
          title: tr("FlightStudio exportiert weiter"),
          body: tr("Du findest den laufenden Export beim FlightStudio-Symbol im Windows-Infobereich."),
          icon: iconPath,
        }).show();
    }
  });
  editor.on("closed", () => {
    editor = null;
    if (!manager.active.length) app.quit();
  });
  void editor.loadURL(baseUrl);
}
function updateTray(job) {
  if (!tray) {
    tray = new Tray(
      nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 }),
    );
    tray.on("double-click", showEditor);
  }
  const active = manager.active[0];
  tray.setToolTip(
    active
      ? `FlightStudio · Export ${Math.round(active.progress * 100)} %`
      : "FlightStudio V2",
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: active
          ? `${tr("Export läuft")} · ${Math.round(active.progress * 100)} %`
          : "FlightStudio V2",
        enabled: false,
      },
      { label: tr("Editor öffnen"), click: showEditor },
      {
        label: tr("Exportordner öffnen"),
        click: () => void shell.openPath(manager.directory),
      },
      ...(active
        ? [
            {
              label: tr("Export abbrechen"),
              click: () => void manager.cancel(active.id),
            },
          ]
        : []),
      { type: "separator" },
      { label: tr("Beenden"), click: () => app.quit() },
    ]),
  );
  if (active && blocker === undefined)
    blocker = powerSaveBlocker.start("prevent-app-suspension");
  if (!active && blocker !== undefined) {
    powerSaveBlocker.stop(blocker);
    blocker = undefined;
  }
  if (
    job?.status === "done" &&
    (!editor || !editor.isVisible()) &&
    Notification.isSupported()
  ) {
    const notification = new Notification({
      title: tr("Dein Flugfilm ist fertig"),
      body: tr("FlightStudio öffnen, um das Video zu speichern."),
      icon: iconPath,
    });
    notification.on("click", showEditor);
    notification.show();
  }
}

if (workerUrl) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/\?renderJob=[0-9a-f-]{36}$/.test(workerUrl))
    process.exit(1);
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), "FlightStudio-V2-Renderer"),
  );
  app.whenReady().then(() => {
    const hold = powerSaveBlocker.start("prevent-app-suspension");
    const win = renderer(workerUrl, async (message) => {
      try {
        const origin = new URL(workerUrl).origin;
        const status = await fetch(origin + "/api/status").then((r) =>
          r.json(),
        );
        const id = new URL(workerUrl).searchParams.get("renderJob");
        await fetch(origin + "/api/exports/" + id + "/fail", {
          method: "POST",
          headers: {
            "X-FlightStudio-Token": status.token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ error: message }),
        });
      } finally {
        app.exit(1);
      }
    });
    win.on("closed", () => {
      powerSaveBlocker.stop(hold);
      app.quit();
    });
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (baseUrl) showEditor();
  });
  app.on("window-all-closed", () => {
    if (!manager?.active.length) app.quit();
  });
  app.on("before-quit", (event) => {
    if (quitting || !manager?.active.length) return;
    event.preventDefault();
    void (async () => {
      const answer = await dialog.showMessageBox({
        type: "question",
        title: tr("Export läuft"),
        message: tr("Export abbrechen und FlightStudio beenden?"),
        detail: tr("Beim Schliessen des Editorfensters läuft der Export weiter. „Beenden“ stoppt auch den Hintergrundprozess."),
        buttons: [tr("Weiter exportieren"), tr("Abbrechen und beenden")],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer.response === 1) {
        quitting = true;
        await Promise.all(manager.active.map((j) => manager.cancel(j.id)));
        app.quit();
      }
    })();
  });
  app
    .whenReady()
    .then(async () => {
      ({ english } = await import(pathToFileURL(path.join(root, "public", "messages-en.mjs")).href));
      const prefsFile = path.join(app.getPath("userData"), "preferences.json");
      let preferences = {};
      try { preferences = JSON.parse(await fs.readFile(prefsFile, "utf8")); } catch {}
      if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) preferences = {};
      language = preferences.language === "en" ? "en" : "de";
      let savePreferences = Promise.resolve();
      const persistPreferences = () => {
        const content = JSON.stringify(preferences);
        savePreferences = savePreferences.catch(() => {}).then(() => fs.writeFile(prefsFile, content));
        return savePreferences;
      };
      const fromEditor = (event) => editor && event.sender === editor.webContents && event.senderFrame?.url.startsWith(baseUrl + "/");
      ipcMain.handle("flightstudio:language:get", (event) => fromEditor(event) ? language : "de");
      ipcMain.handle("flightstudio:language:set", async (event, value) => {
        if (!fromEditor(event) || !["de", "en"].includes(value)) throw new Error("Invalid preference request");
        language = value;
        preferences.language = language;
        await persistPreferences();
        updateMenu();
        updateTray();
      });
      ipcMain.handle("flightstudio:theme:get", (event) => fromEditor(event) && preferences.theme === "dark" ? "dark" : "light");
      ipcMain.handle("flightstudio:theme:set", async (event, value) => {
        if (!fromEditor(event) || !["light", "dark"].includes(value)) throw new Error("Invalid preference request");
        preferences.theme = value;
        await persistPreferences();
      });
      process.env.PORT = process.env.FLIGHTSTUDIO_DESKTOP_PORT || "0";
      process.env.FLIGHTSTUDIO_DATA_DIR ||= path.join(
        app.getPath("userData"),
        "data",
      );
      const backend = await import(
        pathToFileURL(path.join(root, "server.mjs")).href
      );
      manager = backend.exportJobs;
      baseUrl = await backend.ready;
      const { UpdateInstaller } = await import(pathToFileURL(path.join(root, "lib", "update-installer.mjs")).href);
      const network = (url, options) => net.fetch(url, { ...options, credentials: "omit" });
      backend.updates.fetch = network;
      const installer = new UpdateInstaller({
        directory: path.join(app.getPath("userData"), "updates"), updates: backend.updates,
        // Node fetch exposes redirect responses so every download host can be checked.
        openFile: file => shell.openPath(file),
        isExporting: () => manager.active.length > 0 || manager.creating,
      });
      const updateHandler = (name, action) => ipcMain.handle("flightstudio:updates:" + name, (event) => {
        if (!fromEditor(event)) throw new Error("Invalid update request");
        return action();
      });
      updateHandler("info", () => ({ portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE) }));
      updateHandler("status", () => installer.state());
      updateHandler("download", () => installer.download());
      updateHandler("cancel", () => installer.cancel());
      updateHandler("install", async () => {
        const result = await installer.install();
        // Only quit after Windows successfully accepted the verified installer.
        setTimeout(() => { quitting = true; app.quit(); }, 500);
        return result;
      });
      manager.launch = async (id) => {
        const win = renderer(
          baseUrl + "/?renderJob=" + id,
          (message) => void manager.fail(id, message),
        );
        win.on(
          "closed",
          () =>
            void manager.fail(
              id,
              "Exportfenster wurde unerwartet geschlossen.",
            ),
        );
        return {
          stop: () => {
            if (!win.isDestroyed()) win.destroy();
          },
        };
      };
      manager.on("change", updateTray);
      updateMenu();
      updateTray();
      showEditor();
    })
    .catch((error) => {
      dialog.showErrorBox(
        "FlightStudio konnte nicht starten",
        error.stack || error.message,
      );
      app.exit(1);
    });
}
