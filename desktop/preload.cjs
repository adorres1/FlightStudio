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

// Never expose ipcRenderer or the Electron event object to page content.
contextBridge.exposeInMainWorld('flightStudioMenu', {
  onCommand: callback => {
    const listener = (_event, command) => { if (typeof command === 'string') callback(command); };
    ipcRenderer.on('flightstudio:menu:command', listener);
    return () => ipcRenderer.removeListener('flightstudio:menu:command', listener);
  },
  ready: () => ipcRenderer.send('flightstudio:menu:ready'),
});
