import { getLanguage } from './i18n.mjs';
import { tourSteps, guideSections, shortcuts } from './tutorial-content.mjs';
import { placeCallout } from './tutorial-layout.mjs';

const $ = id => document.getElementById(id);
const say = (de, en) => getLanguage() === 'en' ? en : de;
const local = value => value[getLanguage()];
const element = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
};

export function installTutorial({ pause, canStart, captureUI, prepareUI, restoreUI }) {
  const help = $('help-dialog');
  help.setAttribute('translate', 'no');
  help.setAttribute('aria-labelledby', 'guide-title');
  const dialog = element('dialog');
  dialog.id = 'tutorial-dialog';
  dialog.setAttribute('translate', 'no');
  dialog.setAttribute('aria-labelledby', 'tutorial-title');
  dialog.setAttribute('aria-describedby', 'tutorial-body');
  dialog.innerHTML = `<div class="tutorial-spotlight" aria-hidden="true"></div>
    <svg class="tutorial-arrow" aria-hidden="true"><defs><marker id="tutorial-arrowhead" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"/></marker></defs><path class="tutorial-arrow-line" marker-end="url(#tutorial-arrowhead)"/></svg>
    <section class="tutorial-card"><div class="tutorial-heading"><span id="tutorial-counter"></span><button id="tutorial-close" type="button">×</button></div>
    <progress id="tutorial-progress" max="${tourSteps.length}" value="1"></progress>
    <div id="tutorial-announcement" aria-live="polite" aria-atomic="true"><h2 id="tutorial-title" tabindex="-1"></h2><p id="tutorial-body"></p><p id="tutorial-tip"></p></div>
    <label id="tutorial-jump-label" for="tutorial-jump"></label><select id="tutorial-jump"></select>
    <div class="tutorial-actions"><button id="tutorial-guide" type="button"></button><span></span><button id="tutorial-back" type="button"></button><button id="tutorial-next" type="button" class="primary"></button></div></section>`;
  document.body.append(dialog);
  const card = dialog.querySelector('.tutorial-card'), ring = dialog.querySelector('.tutorial-spotlight');
  const line = dialog.querySelector('.tutorial-arrow-line');
  let current = 0, savedUI = null, focusBefore = null, target = null, frame = 0, revision = 0;
  const scrollState = [];

  function visibleBounds(el) {
    if (!el?.isConnected || !el.getClientRects().length || el.closest('[hidden]')) return null;
    const bounds = el.getBoundingClientRect();
    const box = { left: Math.max(8, bounds.left - 6), top: Math.max(8, bounds.top - 6), right: Math.min(innerWidth - 8, bounds.right + 6), bottom: Math.min(innerHeight - 8, bounds.bottom + 6) };
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent), r = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { box.left = Math.max(box.left, r.left); box.right = Math.min(box.right, r.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { box.top = Math.max(box.top, r.top); box.bottom = Math.min(box.bottom, r.bottom); }
    }
    return box.right > box.left && box.bottom > box.top ? box : null;
  }
  function position() {
    frame = 0;
    if (!dialog.open) return;
    const box = visibleBounds(target);
    ring.hidden = !box;
    if (box) Object.assign(ring.style, { left: box.left + 'px', top: box.top + 'px', width: box.right - box.left + 'px', height: box.bottom - box.top + 'px' });
    dialog.classList.toggle('without-target', !box);
    const layout = placeCallout(box, card.getBoundingClientRect(), { width: innerWidth, height: innerHeight });
    card.style.left = layout.x + 'px'; card.style.top = layout.y + 'px';
    line.hidden = !layout.arrow;
    line.setAttribute('d', layout.arrow ? `M${layout.arrow.start.x},${layout.arrow.start.y} L${layout.arrow.end.x},${layout.arrow.end.y}` : '');
  }
  function schedulePosition() { if (dialog.open && !frame) frame = requestAnimationFrame(position); }
  const observer = new ResizeObserver(schedulePosition);
  observer.observe(card);
  window.addEventListener('resize', schedulePosition);
  document.addEventListener('scroll', schedulePosition, true);

  function labels() {
    $('tutorial-close').setAttribute('aria-label', say('Tutorial beenden', 'Exit tutorial'));
    $('tutorial-jump-label').textContent = say('Direkt zu einem Thema', 'Jump to a topic');
    $('tutorial-guide').textContent = say('Anleitung', 'Guide');
    $('tutorial-back').textContent = say('Zurück', 'Back');
    $('tutorial-jump').replaceChildren(...tourSteps.map((step, index) => {
      const option = element('option', `${index + 1}. ${local(step.title)}`); option.value = index; return option;
    }));
  }
  async function showStep(index, focus = true) {
    if (!dialog.open) return;
    const version = ++revision;
    current = Math.max(0, Math.min(tourSteps.length - 1, index));
    const step = tourSteps[current];
    prepareUI(step);
    observer.disconnect(); observer.observe(card);
    target = document.querySelector(step.target);
    if (target) { observer.observe(target); target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); }
    $('tutorial-counter').textContent = say(`Schritt ${current + 1} von ${tourSteps.length}`, `Step ${current + 1} of ${tourSteps.length}`);
    $('tutorial-progress').value = current + 1;
    $('tutorial-progress').setAttribute('aria-label', say('Tutorial-Fortschritt', 'Tutorial progress'));
    $('tutorial-title').textContent = local(step.title);
    $('tutorial-body').textContent = local(step.body);
    $('tutorial-tip').textContent = local(step.tip);
    $('tutorial-back').disabled = current === 0;
    $('tutorial-next').textContent = current === tourSteps.length - 1 ? say('Fertig', 'Finish') : say('Weiter →', 'Next →');
    $('tutorial-jump').value = current;
    // Panel changes resize the preview. Wait for layout, not an arbitrary delay.
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (!dialog.open || version !== revision) return;
    position();
    if (focus) $('tutorial-title').focus({ preventScroll: true });
  }
  function finish() {
    if (!dialog.open) return;
    ++revision; cancelAnimationFrame(frame); frame = 0;
    dialog.close();
    observer.disconnect(); observer.observe(card);
    target = null;
    restoreUI(savedUI); savedUI = null;
    for (const { el, x, y } of scrollState) if (el.isConnected) { el.scrollLeft = x; el.scrollTop = y; }
    scrollState.length = 0;
    (focusBefore?.isConnected && !focusBefore.closest('dialog:not([open])') ? focusBefore : $('help')).focus({ preventScroll: true });
  }
  function start(index = 0) {
    if (dialog.open || !canStart()) return;
    focusBefore = document.activeElement;
    savedUI = captureUI();
    scrollState.push(...[document.scrollingElement, ...document.querySelectorAll('.library,.inspector,#timeline-scroll,.range-toolbar')].map(el => ({ el, x: el.scrollLeft, y: el.scrollTop })));
    pause(); help.close(); labels();
    dialog.showModal();
    void showStep(index);
  }
  $('tutorial-close').onclick = finish;
  $('tutorial-back').onclick = () => void showStep(current - 1);
  $('tutorial-next').onclick = () => current === tourSteps.length - 1 ? finish() : void showStep(current + 1);
  $('tutorial-jump').onchange = event => void showStep(Number(event.target.value));
  $('tutorial-guide').onclick = () => { finish(); openHelp(); };
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  dialog.addEventListener('keydown', event => {
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); $('tutorial-next').click(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); if (current) void showStep(current - 1); }
  });
  // A modal dialog makes the editor inert, including mouse input. Stop file
  // drops here as the editor also has a document-level import handler.
  dialog.addEventListener('drop', event => { event.preventDefault(); event.stopPropagation(); });

  function renderHelp() {
    const heading = element('div', '', 'dialog-heading');
    const title = element('h2', say('Tutorial & Anleitung', 'Tutorial & Guide')); title.id = 'guide-title';
    const close = element('button', '×', 'icon'); close.setAttribute('aria-label', say('Hilfe schliessen', 'Close help')); close.onclick = () => help.close();
    heading.append(title, close);
    const intro = element('section', '', 'guide-intro');
    intro.append(element('p', say('Lerne FlightStudio direkt an den Bedienelementen kennen. Rund 3 Minuten, auch ohne eigene Dateien. Du kannst jederzeit zurückgehen, ein Thema wählen oder beenden.', 'Learn FlightStudio right at its controls. About 3 minutes, with no files required. Go back, jump to a topic or leave at any time.')));
    const begin = element('button', say('Tutorial starten →', 'Start tutorial →'), 'primary'); begin.id = 'tutorial-start'; begin.onclick = () => start();
    intro.append(begin, element('span', say('Dein Projekt bleibt unverändert.', 'Your project stays unchanged.'), 'hint'));
    const searchLabel = element('label', say('In der Anleitung suchen', 'Search the guide'));
    const search = element('input'); search.type = 'search'; search.id = 'guide-search'; search.placeholder = say('Zum Beispiel: Einrasten, Ton, Export …', 'For example: snapping, audio, export …'); searchLabel.append(search);
    const contents = element('div', '', 'guide-chapters');
    const details = guideSections.map(section => {
      const detail = element('details'); detail.id = 'guide-' + section.id;
      detail.append(element('summary', local(section.title)));
      for (const paragraph of section.paragraphs || []) detail.append(element('p', local(paragraph)));
      if (section.steps) { const list = element('ol'); for (const step of section.steps) list.append(element('li', local(step))); detail.append(list); }
      contents.append(detail); return detail;
    });
    const keyboard = element('details'); keyboard.append(element('summary', say('Tastenkürzel auf einen Blick', 'Keyboard shortcuts at a glance')));
    const list = element('dl', '', 'guide-shortcuts');
    for (const [key, description] of shortcuts) { list.append(element('dt', key), element('dd', local(description))); }
    keyboard.append(list); contents.append(keyboard); details.push(keyboard);
    const empty = element('p', say('Kein passendes Thema. Suche nach einem anderen Begriff.', 'No matching topic. Try another word.'), 'hint'); empty.hidden = true;
    search.oninput = () => {
      const query = search.value.trim().toLocaleLowerCase();
      for (const detail of details) { detail.hidden = !!query && !detail.textContent.toLocaleLowerCase().includes(query); detail.open = !!query && !detail.hidden; }
      empty.hidden = details.some(detail => !detail.hidden);
    };
    help.replaceChildren(heading, intro, searchLabel, contents, empty);
  }
  function openHelp() { renderHelp(); if (!help.open) help.showModal(); }
  $('help').onclick = openHelp;
  $('empty-tutorial').onclick = () => start();
  window.addEventListener('flightstudio-language', () => { if (help.open) renderHelp(); if (dialog.open) { labels(); void showStep(current, false); } });
  return { start, finish, get active() { return dialog.open; } };
}
