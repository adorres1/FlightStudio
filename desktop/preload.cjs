const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("flightStudioPrefs", {
  getLanguage: () => ipcRenderer.invoke("flightstudio:language:get"),
  setLanguage: (language) => ipcRenderer.invoke("flightstudio:language:set", language),
  getTheme: () => ipcRenderer.invoke("flightstudio:theme:get"),
  setTheme: (theme) => ipcRenderer.invoke("flightstudio:theme:set", theme),
});
