import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('native CPU export decodes parallel trimmed cameras at different speeds into separate layout tiles',{timeout:120000},async t=>{
  const data=await fs.mkdtemp(path.join(root,'data','qa-cameras-'));
  const port=4490+Math.floor(Math.random()*50),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),FLIGHTSTUDIO_DATA_DIR:data},stdio:'ignore',windowsHide:true});
  t.after(()=>child.kill());
  let status;
  for(let i=0;i<80;i++){try{status=await fetch(base+'/api/status').then(r=>r.json());break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(status?.backgroundExport);
  const api=async(route,options={})=>{
    const response=await fetch(base+route,{...options,headers:{'X-FlightStudio-Token':status.token,...options.headers}});
    const value=await response.json();assert.ok(response.ok,value.error);return value;
  };
  const file=path.join(data,'two-colors.mp4');
  execFileSync(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c=red:s=320x180:r=10:d=1','-f','lavfi','-i','color=c=blue:s=320x180:r=10:d=1',
    '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0','-c:v','libx264','-pix_fmt','yuv420p',file],{windowsHide:true});
  const form=new FormData();form.append('file',new Blob([await fs.readFile(file)]),'Synthetic-cameras.mp4');
  const asset=await api('/api/media',{method:'POST',body:form});
  const project={version:2,name:'Synthetic multicamera test',assets:[asset],tracks:[{id:'a',visible:true},{id:'b',visible:true}],aspect:'16:9',layout:'grid',gaps:{enabled:false},
    clips:[{id:'first',trackId:'a',assetId:asset.id,kind:'video',start:0,in:.2,out:.8,rate:.5},
      {id:'second',trackId:'b',assetId:asset.id,kind:'video',start:0,in:1.2,out:1.8,rate:2}]};
  const job=await api('/api/exports',{method:'POST',body:JSON.stringify({project,range:[.1,.1+1/30],format:'mp4',size:720,fps:30,quality:'high',acceleration:'cpu'})});
  assert.equal(job.encoder,'libx264');
  let done;
  for(let i=0;i<400;i++){done=await api('/api/exports/'+job.id);if(['done','failed'].includes(done.status))break;await new Promise(r=>setTimeout(r,150));}
  assert.equal(done.status,'done',done.error);
  const output=path.join(data,'exports',job.id+'.mp4');
  const pixel=x=>[...execFileSync(ffmpeg,['-v','error','-i',output,'-vf',`format=rgb24,crop=1:1:${x}:360`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true})];
  const left=pixel(320),right=pixel(960);
  assert.ok(left[0]>230&&left[2]<20,JSON.stringify(left));
  assert.ok(right[2]>230&&right[0]<20,JSON.stringify(right));
});
