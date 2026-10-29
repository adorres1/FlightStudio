const commands = new Set(['new-project','open-project','save-project','import-media','import-flight','panel-project','export-open','gallery-media','gallery-flights','panel-clip','panel-camera','panel-instruments','help','updates-open','undo','redo']);
const shortcuts = { n:'new-project', o:'open-project', s:'save-project', i:'import-media', e:'export-open' };
export function installAppMenu({ canRun = () => true } = {}) {
  const $ = id => document.getElementById(id), nav = $('app-menubar'), native = window.flightStudioMenu;
  const menus = [...nav.querySelectorAll('details')];
  const closeMenus = () => { for (const menu of menus) menu.open = false; };
  function run(command) {
    if (!canRun() || document.querySelector('dialog[open]')) return;
    if (commands.has(command)) { const button = $(command); if (button && !button.disabled) button.click(); }
    else if (['language:de','language:en','theme:light','theme:dark'].includes(command)) {
      const [id,value] = command.split(':'); $(id).value = value; $(id).dispatchEvent(new Event('change', { bubbles:true }));
    }
  }
  nav.hidden = Boolean(native);
  document.documentElement.classList.toggle('native-menu', Boolean(native));
  for (const button of nav.querySelectorAll('[data-command]')) button.onclick = () => run(button.dataset.command);
  nav.addEventListener('click', event => { if (event.target.closest('button')) closeMenus(); });
  nav.addEventListener('change', closeMenus);
  for (const menu of menus) {
    menu.addEventListener('toggle', () => { if (menu.open) for (const other of menus) if (other !== menu) other.open = false; });
    menu.addEventListener('keydown', event => {
      if (event.target.matches('select')) return;
      const items = [...menu.querySelectorAll('.menu-popup button:not(:disabled),.menu-popup select')];
      const index = items.indexOf(document.activeElement);
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); menu.open = true;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : event.key === 'ArrowDown' ? (index+1)%items.length : (index-1+items.length)%items.length;
        items[next]?.focus();
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); menu.open = false; menu.querySelector('summary').focus(); }
    });
  }
  document.addEventListener('pointerdown', event => { if (!nav.contains(event.target)) closeMenus(); });
  document.addEventListener('focusin', event => { if (!nav.contains(event.target)) closeMenus(); });
  document.addEventListener('keydown', event => {
    // Native accelerators own these keys in Electron; do not run the action twice.
    if (native || event.altKey) return;
    const command = event.key === 'F1' ? 'help' : (event.ctrlKey || event.metaKey) && !event.shiftKey ? shortcuts[event.key.toLowerCase()] : null;
    if (!command) return;
    event.preventDefault(); event.stopImmediatePropagation(); closeMenus(); run(command);
  }, true);
  if (native) {
    window.addEventListener('flightstudio:file-menu', event => {
      if (['open-project','import-media','import-flight'].includes(event.detail)) run(event.detail);
    });
    native.onCommand(run); native.ready();
  }
}
