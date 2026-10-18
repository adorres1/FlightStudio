import { clamp, length, normalizedRect } from '/lib/timeline.mjs';
import { applyTransition, transitionFor, previousClip, imageTransform } from '/lib/clip-effects.mjs';

export function renderClipEffects({ host, clip: c, state, rect, locked, field, snapshot, changed, render }) {
  const $ = id => host.querySelector('#' + id);
  const add = html => host.insertAdjacentHTML('beforeend', html);
  const action = fn => { if (locked) return; snapshot(); fn(); changed(); };
  const bind = (id, fn) => { $(id).onchange = event => action(() => fn(event.target)); };
  const live = (id, fn, feedback = () => {}) => {
    let editing = false;
    $(id).oninput = event => {
      if (locked) return;
      if (!editing) snapshot(); editing = true;
      fn(Number(event.target.value)); feedback(); render();
    };
    $(id).onchange = event => {
      if (locked) return;
      if (!editing) { snapshot(); fn(Number(event.target.value)); }
      editing = false; changed();
    };
  };
  add(`<label class="check clip-enabled"><input id="clip-enabled" type="checkbox" ${c.enabled !== false ? 'checked' : ''}> Clip aktiv · Bild und Ton</label>`);
  bind('clip-enabled', el => { c.enabled = el.checked; });
  if (c.kind !== 'audio') {
    add(`<details class="effect-section" open><summary>Grösse, Position & Zoom</summary>
      <div class="two-fields">${field('Links (%)', 'pos-x', (rect.x*100).toFixed(1), 'number', 'min="-500" max="500" step=".5"')}${field('Oben (%)', 'pos-y', (rect.y*100).toFixed(1), 'number', 'min="-500" max="500" step=".5"')}${field('Breite (%)', 'pos-w', (rect.w*100).toFixed(1), 'number', 'min="4" max="500" step=".5"')}${field('Höhe (%)', 'pos-h', (rect.h*100).toFixed(1), 'number', 'min="4" max="500" step=".5"')}</div>
      <p class="hint">Fenster dürfen über den Bildrand hinausreichen. Im fertigen Film ist nur der sichtbare Ausschnitt enthalten.</p>
      <label>Deckkraft <output id="opacity-value">${Math.round((c.opacity??1)*100)}%</output><input id="clip-opacity" type="range" min="0" max="100" value="${(c.opacity??1)*100}"></label>
      <div class="effect-actions"><button id="clip-full">Vollbild</button><button id="clip-auto">Layout verwenden</button></div>
      ${['video','photo'].includes(c.kind) ? `<div class="image-controls"><label>Zoom im Bild <output id="image-zoom-value">${Math.round(imageTransform(c.imageTransform).zoom*100)}%</output><input id="image-zoom" type="range" min="10" max="1000" value="${imageTransform(c.imageTransform).zoom*100}"></label>
      <div class="two-fields">${field('Bild nach rechts (%)','image-x',(imageTransform(c.imageTransform).x*100).toFixed(1),'number','min="-500" max="500" step="1"')}${field('Bild nach unten (%)','image-y',(imageTransform(c.imageTransform).y*100).toFixed(1),'number','min="-500" max="500" step="1"')}</div>
      <label>Bildausschnitt<select id="clip-fit"><option value="contain" ${c.fit!=='cover'?'selected':''}>Vollständig einpassen</option><option value="cover" ${c.fit==='cover'?'selected':''}>Fenster ausfüllen / beschneiden</option></select></label>
      <p class="hint">Mausrad im Bild: zoomen. Alt + Ziehen: Bildausschnitt verschieben.</p></div>` : ''}
      <button id="transform-reset" class="wide">Bildposition & Zoom zurücksetzen</button></details>`);
    for (const key of ['x','y','w','h']) live('pos-'+key, value => { c.rect = normalizedRect({ ...c.rect || rect, [key]:value/100 }); });
    live('clip-opacity', value => { c.opacity=clamp(value/100,0,1); }, () => { $('opacity-value').textContent=Math.round(c.opacity*100)+'%'; });
    $('clip-full').onclick=()=>action(()=>{c.rect={x:0,y:0,w:1,h:1};});
    $('clip-auto').onclick=()=>action(()=>{c.rect=null;});
    $('transform-reset').onclick=()=>action(()=>{c.rect=null;c.imageTransform=null;c.fit='contain';});
    if ($('image-zoom')) {
      live('image-zoom', value=>{c.imageTransform=imageTransform({...imageTransform(c.imageTransform),zoom:value/100});},()=>{$('image-zoom-value').textContent=Math.round(c.imageTransform.zoom*100)+'%';});
      for(const key of ['x','y']) live('image-'+key,value=>{c.imageTransform=imageTransform({...imageTransform(c.imageTransform),[key]:value/100});});
      bind('clip-fit',el=>{c.fit=el.value;});
    }
    add(`<details class="effect-section" open><summary>Bild ein- und ausblenden</summary>
      <div class="two-fields">${field('Einblenden (s)','fade-in',c.fadeIn||0,'number','min="0" step=".1"')}${field('Ausblenden (s)','fade-out',c.fadeOut||0,'number','min="0" step=".1"')}</div>
      <label>Schnellblende<select id="fade-preset"><option value="">Vorgabe wählen</option><option value="0">Keine Blenden</option><option value="0.5">0.5 s</option><option value="1">1 s</option><option value="2">2 s</option></select></label>
      <p class="hint">Die kleinen Griffe oben am Timeline-Clip regeln die Blenden direkt.</p></details>`);
    const separateAudio = () => { c.audioFadeIn ??= c.fadeIn || 0; c.audioFadeOut ??= c.fadeOut || 0; };
    live('fade-in',v=>{separateAudio();c.fadeIn=clamp(v||0,0,length(c));}); live('fade-out',v=>{separateAudio();c.fadeOut=clamp(v||0,0,length(c));});
    bind('fade-preset',el=>{if(el.value!==''){separateAudio();c.fadeIn=c.fadeOut=Math.min(Number(el.value),length(c)/2);}});
  }
  if (['video','audio'].includes(c.kind)) {
    add(`<details id="audio-section" class="effect-section" open><summary>Ton · Lautstärke & Blenden</summary>
      <label>Lautstärke <output id="volume-value">${Math.round((c.volume??1)*100)}%</output><input id="volume-slider" type="range" min="0" max="200" value="${(c.volume??1)*100}"></label>
      <div class="two-fields">${field('Lautstärke (%)','clip-volume',Math.round((c.volume??1)*100),'number','min="0" max="200" step="1"')}<div class="gain-readout"><output id="volume-db"></output><button id="volume-reset">100% zurücksetzen</button></div></div>
      <label class="check"><input id="clip-muted" type="checkbox" ${c.muted?'checked':''}> Clip stummschalten</label>
      <div class="two-fields">${field('Ton einblenden (s)','audio-fade-in',c.audioFadeIn??c.fadeIn??0,'number','min="0" step=".1"')}${field('Ton ausblenden (s)','audio-fade-out',c.audioFadeOut??c.fadeOut??0,'number','min="0" step=".1"')}</div>
      <p class="hint">100% entspricht dem Originalton. Die Linie unten im Timeline-Clip lässt sich hoch und runter ziehen.</p></details>`);
    const feedback=()=>{
      const volume=c.volume??1; $('volume-value').textContent=Math.round(volume*100)+'%';
      $('volume-db').textContent=volume>0?(20*Math.log10(volume)).toFixed(1)+' dB':'−∞ dB';
      $('volume-slider').value=volume*100; $('clip-volume').value=Math.round(volume*100);
    };
    for(const id of ['volume-slider','clip-volume']) live(id,v=>{c.volume=clamp(v/100,0,2);},feedback);
    feedback(); $('volume-reset').onclick=()=>action(()=>{c.volume=1;c.muted=false;});
    bind('clip-muted',el=>{c.muted=el.checked;});
    live('audio-fade-in',v=>{c.audioFadeIn=clamp(v||0,0,length(c));}); live('audio-fade-out',v=>{c.audioFadeOut=clamp(v||0,0,length(c));});
    host.querySelector('.status-chip').after($('audio-section'));
  }
  if (['video','photo','audio'].includes(c.kind)) {
    const tr=transitionFor(state.clips,c), previous=previousClip(state.clips,c);
    add(`<details class="effect-section" open><summary>Übergang vom vorherigen Clip</summary>
      <label>Übergang<select id="transition-type"><option value="none">Harter Schnitt</option><option value="dissolve">Überblenden</option>${c.kind!=='audio'?'<option value="wipe">Wischen nach rechts</option>':''}</select></label>
      ${field('Übergangsdauer (s)','transition-duration',tr?Number(tr.duration.toFixed(3)):1,'number','min=".05" step=".1"')}
      <button id="transition-apply" class="wide">Übergang anwenden</button><p class="hint">${previous?'Der gewählte Clip wird mit dem vorherigen Clip überlappt. Sein Start verschiebt sich; andere Spuren bleiben an ihrer Zeitposition.':'Kein passender vorheriger Clip auf dieser Spur.'}</p>
      <p class="hint">Auch möglich: Clips auf derselben Spur leicht übereinanderziehen.</p><p id="transition-error" class="error" role="alert" hidden></p></details>`);
    $('transition-type').value=tr?.type||'none';
    $('transition-apply').disabled=locked||!previous;
    $('transition-apply').onclick=()=>{
      if(locked)return;
      try {const next=applyTransition(state.clips,c,$('transition-type').value,Number($('transition-duration').value));action(()=>Object.assign(c,next));}
      catch(error){$('transition-error').textContent=error.message;$('transition-error').hidden=false;}
    };
  }
}
