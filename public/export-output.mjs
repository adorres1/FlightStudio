import {translate as t} from './i18n.mjs';
const $=id=>document.getElementById(id);
export function resetExportOutput() {
  $('export-save-as').hidden=true;$('export-reveal').hidden=true;
  $('export-progress').value=0;$('export-progress').hidden=true;
  $('export-status').textContent='';$('export-destination').textContent='';
}
export async function chooseBrowserTarget(format,name) {
  if(!window.showSaveFilePicker)throw new Error(t('Bitte die Desktop-App oder Chrome/Edge verwenden, um vor dem Export einen Speicherort zu wählen.'));
  const base=String(name||'FlightStudio-Film').replace(/\.(mp4|webm)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,120)||'FlightStudio-Film';
  try {
    const handle=await window.showSaveFilePicker({id:'flightstudio-export',suggestedName:base+'.'+format,excludeAcceptAllOption:true,
      types:[{description:format.toUpperCase()+' Video',accept:{[format==='mp4'?'video/mp4':'video/webm']:['.'+format]}}]});
    const stream=await handle.createWritable();
    $('export-destination').textContent=t('Speicherort')+': '+handle.name;
    return {handle,stream};
  } catch(e){if(e.name==='AbortError')return null;throw e;}
}
export async function writeBrowserTarget(target,url) {
  try {
    const response=await fetch(url);
    if(!response.ok||!response.body)throw new Error(t('Die fertige Videodatei konnte nicht gelesen werden.'));
    await response.body.pipeTo(target.stream);
    target.saved=true;
  } catch(e){await target.stream.abort().catch(()=>{});throw e;}
}
export async function saveBrowserCopy(job) {
  const target=await chooseBrowserTarget(job.format,job.name);
  if(!target)return null;
  await writeBrowserTarget(target,job.url);
  $('export-status').textContent=t('Film gespeichert');return target;
}
