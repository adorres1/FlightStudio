import { playbackIntervals, outputDuration, advancePlayback } from '/lib/timeline.mjs';
import { qualities } from '/lib/export-settings.mjs';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Frame times remain exact. At most one upload overlaps preparation of the next
// frame, keeping order and memory bounded even for 4K exports.
export async function renderExport(app,scene,id){
  const intervals=playbackIntervals(app.state),duration=outputDuration(intervals,...scene.range);
  const fps=scene.options.fps||30,total=Math.ceil(duration*fps);
  app.pause();app.exporting=true;app.size(scene.options.size);
  let reportAt=0,pending=Promise.resolve(),uploadError;
  try{
    for(let frame=0;frame<total;frame++){
      if(uploadError)throw uploadError;
      app.time=advancePlayback(intervals,scene.range[0],frame/fps);
      await app.prepareExportFrame?.(frame);
      const started=performance.now();
      while(app.render()){
        if(uploadError)throw uploadError;
        if(app.mediaError)throw new Error(app.mediaError);
        if(performance.now()-started>90000)throw new Error('Medien oder Karten konnten nicht vollständig geladen werden.');
        if(performance.now()-reportAt>1500){
          reportAt=performance.now();
          await app.api(`/api/exports/${id}/progress`,{method:'POST',body:JSON.stringify({progress:frame/total})});
        }
        await wait(4);
      }
      if(app.mediaError)throw new Error(app.mediaError);
      const blob=await new Promise((resolve,reject)=>app.canvas.toBlob(
        b=>b?resolve(b):reject(new Error('Exportbild konnte nicht erstellt werden.')),
        'image/jpeg',qualities[scene.options.quality||'standard'].jpeg));
      await pending;
      if(uploadError)throw uploadError;
      pending=app.api(`/api/exports/${id}/frames/${frame}`,{method:'PUT',body:blob,raw:true})
        .catch(error=>{uploadError=error;});
    }
    await pending;if(uploadError)throw uploadError;
    await app.api(`/api/exports/${id}/finish`,{method:'POST'});
  }catch(error){
    await pending;
    await app.api(`/api/exports/${id}/fail`,{method:'POST',body:JSON.stringify({error:error.message})}).catch(()=>{});
  }
}
