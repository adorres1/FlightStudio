import {translate as t,getLanguage} from './i18n.mjs';
import {resetExportOutput,chooseBrowserTarget,writeBrowserTarget,saveBrowserCopy} from './export-output.mjs';
const $=id=>document.getElementById(id);
const running=j=>['queued','recording','encoding','saving'].includes(j.status);
const labels={queued:'Wird vorbereitet',recording:'Filmbilder werden erstellt',encoding:'Videodatei wird erstellt',saving:'Film wird gespeichert',done:'Fertig','save-failed':'Speichern fehlgeschlagen',failed:'Fehlgeschlagen',cancelled:'Abgebrochen'};
export function selectedExport(jobs,id){return jobs.find(running)||jobs.find(j=>j.id===id)||null;}
export class BackgroundExporter {
  constructor(app){
    this.app=app;this.active=false;this.pending=0;this.background=true;this.targets=new Map();this.revision=0;
    this.timer=setInterval(()=>void this.refresh().catch(()=>{}),1500);
    window.addEventListener('beforeunload',event=>{if([...this.targets.values()].some(x=>!x.saved&&!x.error)){event.preventDefault();event.returnValue='';}});
  }
  open(){this.revision++;this.jobId=null;resetExportOutput();}
  async start(options){
    if(this.starting)return;
    this.revision++;this.starting=true;this.app.pause();this.jobId=null;resetExportOutput();
    $('export-status').textContent=t('Bitte Speicherort und Dateiname wählen.');
    let target;
    try{
      const input={...options,project:this.app.project(),range:[...this.app.range]};
      let job;
      if(window.flightStudioExport)job=await window.flightStudioExport.start(input);
      else {
        target=await chooseBrowserTarget(options.format,input.project.name);
        if(!target)return false;
        job=await this.app.api('/api/exports',{method:'POST',body:JSON.stringify(input)});
        this.targets.set(job.id,target);
      }
      if(!job)return false;
      this.jobId=job.id;
      this.app.toast(window.flightStudioExport?'Export im Hintergrund gestartet. Du kannst das Editorfenster schliessen.':'Export gestartet. Diesen Tab bis zum Speichern geöffnet lassen.');
      return true;
    }catch(e){if(target)await target.stream.abort().catch(()=>{});throw e;}
    finally{
      this.starting=false;$('export-close').disabled=false;
      if(!this.jobId){resetExportOutput();$('export-status').textContent=t('Kein Export gestartet.');$('export-start').disabled=false;$('export-cancel').hidden=true;}
      await this.refresh();
    }
  }
  async refresh(){
    if(this.refreshing||this.starting)return;
    this.refreshing=true;const revision=this.revision;
    try{
      const jobs=await this.app.api('/api/exports');
      if(this.starting||revision!==this.revision)return;
      const current=selectedExport(jobs,this.jobId),active=jobs.some(running);
      $('export-start').disabled=active;$('export-close').disabled=false;
      $('export-cancel').hidden=!active||current?.status==='saving';
      $('export-open').textContent=active?`Export ${Math.round((current?.progress||0)*100)} % ↗`:t('Exportieren ↗');
      if(current){
        this.jobId=current.id;
        const target=this.targets.get(current.id);
        if(target&&current.status==='done'&&!target.saved&&!target.error){
          $('export-start').disabled=true;$('export-status').textContent=t('Film wird gespeichert');
          try{await writeBrowserTarget(target,current.url);}catch(e){target.error=e.message;}
          $('export-start').disabled=false;
        }
        if(target&&['cancelled','failed'].includes(current.status)){await target.stream.abort().catch(()=>{});this.targets.delete(current.id);}
        const saveError=current.status==='save-failed'||target?.error;
        $('export-progress').hidden=false;$('export-progress').value=current.progress;
        $('export-status').setAttribute('translate','no');
        $('export-status').textContent=[t(saveError?'Speichern fehlgeschlagen':current.savedPath||target?.saved?'Film gespeichert':labels[current.status]),
          running(current)?Math.round(current.progress*100)+' %':null,current.encoderLabel,current.error||target?.error].filter(Boolean).join(' · ');
        $('export-destination').textContent=current.destinationPath||(target?t('Speicherort')+': '+target.handle.name:'');
        const preview=$('export-result');
        if(current.url){if(preview.getAttribute('src')!==current.url)preview.src=current.url;preview.hidden=false;}
        else {preview.pause();preview.hidden=true;preview.removeAttribute('src');}
        $('export-download').hidden=true;
        $('export-reveal').hidden=!window.flightStudioExport||!current.savedPath;
        $('export-reveal').onclick=()=>void window.flightStudioExport.reveal(current.id).catch(e=>this.app.toast(e.message,true));
        $('export-save-as').hidden=!current.url;
        $('export-save-as').textContent=t(saveError?'Speicherort erneut wählen …':'Kopie speichern …');
        $('export-save-as').onclick=()=>void this.saveCopy(current);
      }
      const host=$('export-history');host.replaceChildren();
      for(const job of jobs.slice(0,20)){
        const row=document.createElement('article'),text=document.createElement('span');text.setAttribute('translate','no');
        text.textContent=`${new Date(job.created).toLocaleString(getLanguage()==='en'?'en-GB':'de-CH')} · ${job.name} · ${t(job.savedPath?'Film gespeichert':labels[job.status])}`;
        row.append(text);
        if(job.url){
          const preview=document.createElement('button');preview.textContent=t('Ansehen');preview.onclick=()=>{this.jobId=job.id;void this.refresh();};row.append(preview);
          const save=document.createElement('button');save.textContent=t(job.savedPath&&window.flightStudioExport?'Im Ordner anzeigen':'Speichern unter …');
          save.onclick=()=>job.savedPath&&window.flightStudioExport?void window.flightStudioExport.reveal(job.id).catch(e=>this.app.toast(e.message,true)):void this.saveCopy(job);row.append(save);
        }
        host.append(row);
      }
    }finally{this.refreshing=false;}
  }
  async saveCopy(job){
    try{if(window.flightStudioExport)await window.flightStudioExport.save(job.id);else{const target=await saveBrowserCopy(job);if(target)this.targets.set(job.id,target);}await this.refresh();}
    catch(e){this.app.toast(e.message,true);}
  }
  async cancel(){if(this.jobId)await this.app.api(`/api/exports/${this.jobId}/cancel`,{method:'POST'});await this.refresh();}
}
