import {filmName} from '../lib/export-name.mjs';
import path from 'node:path';
import {exportFilename,prepareDestination} from '../lib/export-destination.mjs';

export function exportDialogs({manager,dialog,window: getWindow,shell,defaultDirectory,tr=x=>x}) {
  let choosing=false,lastDirectory=defaultDirectory;
  async function choose(name,format) {
    if(!['mp4','webm'].includes(format))throw new Error('Unbekanntes Exportformat.');
    const result=await dialog.showSaveDialog(getWindow(),{
      title:tr('Film speichern'),buttonLabel:tr('Hier speichern'),
      defaultPath:path.join(lastDirectory,exportFilename(name,format)),
      filters:[{name:format.toUpperCase()+' Video',extensions:[format]}],
      properties:['showOverwriteConfirmation','createDirectory'],
    });
    if(result.canceled||!result.filePath)return null;
    const target=await prepareDestination(result.filePath,format,path.dirname(manager.directory));
    lastDirectory=path.dirname(target.path);
    return target;
  }
  return {
    async start(options) {
      if(choosing||manager.creating||manager.active.length)throw new Error('Ein Export läuft bereits. Bitte warten oder diesen abbrechen.');
      choosing=true;
      try {
        if(!options?.project||!Array.isArray(options.range)||options.range[1]<=options.range[0])throw new Error('Ungültiger Exportbereich.');
        const name=options.name===undefined?options.project.name:filmName(options.name);
        const target=await choose(name,options.format);
        if(!target)return null;
        return await manager.create(options,target);
      } finally {choosing=false;}
    },
    async save(id) {
      if(choosing)throw new Error('Bitte zuerst den Speicherdialog schliessen.');
      choosing=true;
      try {
        const job=manager.get(id);
        if(!['done','save-failed'].includes(job.status))throw new Error('Der Film ist noch nicht fertig.');
        const target=await choose(job.name,job.format);
        if(!target)return null;
        return await manager.saveAs(id,target);
      } finally {choosing=false;}
    },
    reveal(id) {
      const job=manager.get(id);
      if(!job.savedPath)throw new Error('Der Film wurde noch nicht gespeichert.');
      shell.showItemInFolder(job.savedPath);
    },
  };
}
