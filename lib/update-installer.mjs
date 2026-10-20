import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
const allowedHosts=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
export function allowedDownload(url) {
  const u=new URL(url);
  return u.protocol==='https:'&&!u.username&&!u.password&&allowedHosts.has(u.hostname)&&(!u.port||u.port==='443');
}
export class UpdateInstaller {
  constructor({directory,updates,fetchImpl=fetch,openFile,isExporting=()=>false}) {
    Object.assign(this,{directory,updates,fetch:fetchImpl,openFile,isExporting});
    this.status={stage:'idle',progress:0};this.ready=null;this.abort=null;
  }
  state(){return {...this.status};}
  async download() {
    if(this.isExporting())throw new Error('Bitte zuerst den laufenden Export abschliessen.');
    if(this.abort)throw new Error('Ein Update wird bereits heruntergeladen.');
    const controller=new AbortController();this.abort=controller;this.ready=null;
    this.status={stage:'checking',progress:0};
    let target,handle;
    try {
      const asset=await this.updates.installer();
      this.status={stage:'downloading',progress:0,version:asset.version};
      let url=asset.url,response;
      for(let i=0;i<6;i++){
        if(!allowedDownload(url))throw new Error('Unzulässige Downloadadresse.');
        response=await this.fetch(url,{redirect:'manual',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(600000)])});
        if([301,302,303,307,308].includes(response.status)){
          const next=response.headers.get('location');await response.body?.cancel();
          if(!next)throw new Error('Ungültige Weiterleitung.');
          url=new URL(next,url).href;continue;
        }
        break;
      }
      if(!response?.ok||!response.body)throw new Error('Das Update konnte nicht heruntergeladen werden.');
      const folder=path.join(this.directory,asset.version);
      await fs.mkdir(folder,{recursive:true});
      // Unique filename prevents a partial previous download being mistaken for a verified installer.
      target=path.join(folder,`FlightStudio-Setup-${asset.version}-${Date.now()}.exe`);
      handle=await fs.open(target,'wx');
      const hash=createHash('sha256');let bytes=0;
      for await(const chunk of response.body){
        controller.signal.throwIfAborted();bytes+=chunk.length;
        if(bytes>asset.size)throw new Error('Die Dateigrösse stimmt nicht überein.');
        hash.update(chunk);await handle.writeFile(chunk);
        this.status.progress=bytes/asset.size;
      }
      await handle.close();handle=null;
      if(bytes!==asset.size||hash.digest('hex')!==asset.sha256)throw new Error('Die Prüfsumme stimmt nicht überein. Bitte erneut herunterladen.');
      this.ready={...asset,path:target};this.status={stage:'ready',progress:1,version:asset.version};
      return this.state();
    }catch(error){
      await handle?.close().catch(()=>{});
      if(target)await fs.rm(target,{force:true}).catch(()=>{});
      this.status={stage:controller.signal.aborted?'cancelled':'error',progress:0};
      throw error;
    }finally{this.abort=null;}
  }
  cancel(){this.abort?.abort();return this.state();}
  async install(){
    if(this.isExporting())throw new Error('Bitte zuerst den laufenden Export abschliessen.');
    if(!this.ready)throw new Error('Bitte das Update zuerst herunterladen.');
    const hash=createHash('sha256');let bytes=0;
    for await(const chunk of createReadStream(this.ready.path)){hash.update(chunk);bytes+=chunk.length;}
    if(bytes!==this.ready.size||hash.digest('hex')!==this.ready.sha256)
      throw new Error('Die heruntergeladene Datei wurde verändert.');
    const error=await this.openFile(this.ready.path);
    if(error)throw new Error('Windows konnte das Installationsprogramm nicht öffnen: '+error);
    this.status={stage:'installing',progress:1,version:this.ready.version};return this.state();
  }
}
