// All editor commands travel through the narrow preload bridge.
function editorMenu({ tr = x => x, send, ready = false, language = 'de', theme = 'light', openExports, openData, quit }) {
  const action = (label, command, accelerator) => ({ label: tr(label), enabled: ready, ...(accelerator ? { accelerator } : {}), click: () => send(command) });
  const separator = { type: 'separator' };
  return [
    { label: tr('Datei'), submenu: [
      action('Neues Projekt', 'new-project', 'CmdOrCtrl+N'),
      action('Projekt öffnen …', 'open-project', 'CmdOrCtrl+O'),
      action('Projekt sichern', 'save-project', 'CmdOrCtrl+S'), separator,
      action('Medien importieren …', 'import-media', 'CmdOrCtrl+I'),
      action('Flüge (IGC) hinzufügen …', 'import-flight'), separator,
      action('Projekt-Einstellungen', 'panel-project'), action('Exportieren …', 'export-open', 'CmdOrCtrl+E'), separator,
      { label: tr('Exportordner öffnen'), click: openExports },
      { label: tr('Programmdaten öffnen'), click: openData }, separator,
      { label: tr('Beenden'), click: quit },
    ] },
    { label: tr('Bearbeiten'), submenu: [
      action('Rückgängig', 'undo', 'CmdOrCtrl+Z'), action('Wiederholen', 'redo', 'CmdOrCtrl+Shift+Z'), separator,
      { role: 'cut', label: tr('Ausschneiden') }, { role: 'copy', label: tr('Kopieren') },
      { role: 'paste', label: tr('Einfügen') }, { role: 'selectAll', label: tr('Alles auswählen') },
    ] },
    { label: tr('Ansicht'), submenu: [
      action('Medien', 'gallery-media'), action('Flüge (IGC)', 'gallery-flights'), separator,
      action('Clip', 'panel-clip'), action('Flugkarte & Kamera', 'panel-camera'), action('Instrumente', 'panel-instruments'), separator,
      { label: tr('Sprache / Language'), submenu: ['de','en'].map(value => ({
        label: value === 'de' ? 'Deutsch' : 'English', type: 'radio', checked: language === value, enabled: ready, click: () => send('language:'+value),
      })) },
      { label: tr('Erscheinungsbild'), submenu: ['light','dark'].map(value => ({
        label: tr(value === 'light' ? 'Hell' : 'Dunkel'), type: 'radio', checked: theme === value, enabled: ready, click: () => send('theme:'+value),
      })) }, separator,
      { role: 'resetZoom', label: tr('Originalgrösse') }, { role: 'zoomIn', label: tr('Vergrössern') },
      { role: 'zoomOut', label: tr('Verkleinern') }, { role: 'togglefullscreen', label: tr('Vollbild umschalten') },
    ] },
    { label: tr('Hilfe'), submenu: [action('Tutorial & Hilfe','help','F1'), action('Updates suchen','updates-open')] },
  ];
}
// File pickers require a user gesture. Carry the native menu click into the page
// synchronously; the renderer still applies its busy/modal and command guards.
function dispatchEditorCommand(contents, command) {
  if (['open-project','import-media','import-flight'].includes(command)) {
    const code = 'window.dispatchEvent(new CustomEvent("flightstudio:file-menu", { detail: ' + JSON.stringify(command) + ' }))';
    return contents.executeJavaScript(code, true);
  }
  contents.send('flightstudio:menu:command', command);
  return Promise.resolve();
}
module.exports = { editorMenu, dispatchEditorCommand };
