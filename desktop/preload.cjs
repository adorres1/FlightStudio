const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("flightStudioPrefs", {
  getLanguage: () => ipcRenderer.invoke("flightstudio:language:get"),
  setLanguage: (language) => ipcRenderer.invoke("flightstudio:language:set", language),
  getTheme: () => ipcRenderer.invoke("flightstudio:theme:get"),
  setTheme: (theme) => ipcRenderer.invoke("flightstudio:theme:set", theme),
});

contextBridge.exposeInMainWorld("flightStudioUpdates", {
  info: () => ipcRenderer.invoke("flightstudio:updates:info"),
  status: () => ipcRenderer.invoke("flightstudio:updates:status"),
  download: () => ipcRenderer.invoke("flightstudio:updates:download"),
  cancel: () => ipcRenderer.invoke("flightstudio:updates:cancel"),
  install: () => ipcRenderer.invoke("flightstudio:updates:install"),
});
