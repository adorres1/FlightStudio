import {filmName} from '../lib/export-name.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exportFilename,prepareDestination,saveDestination} from '../lib/export-destination.mjs';
import {ExportJobs} from '../lib/export-jobs.mjs';
import {exportDialogs} from '../desktop/export-dialog.mjs';
import {selectedExport} from '../public/background-export.mjs';
import {writeBrowserTarget} from '../public/export-output.mjs';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'flightstudio-save-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const data=path.join(root,'internal');await fs.mkdir(data);
  return {root,data,file:path.join(root,'film.mp4')};
}
test('safe export names retain the selected format',()=>{
  assert.equal(exportFilename('A/B: holiday.webm','mp4'),'A-B- holiday.mp4');
  assert.equal(exportFilename('CON','mp4'),'FlightStudio-Film.mp4');
});
test('destination is checked before rendering; existing file changes only after successful commit',async t=>{
  const {root,data,file}=await fixture(t), source=path.join(data,'render.mp4');
  await fs.writeFile(file,'old');await fs.writeFile(source,'new');
  const target=await prepareDestination(file,'mp4',data);
  assert.equal(await fs.readFile(file,'utf8'),'old');
  await saveDestination(source,target);
  assert.equal(await fs.readFile(file,'utf8'),'new');
  assert.equal(await fs.readFile(source,'utf8'),'new');
  assert.ok(!(await fs.readdir(root)).some(x=>x.startsWith('.flightstudio-')));
  await assert.rejects(()=>prepareDestination(path.join(data,'export.mp4'),'mp4',data),/Programmdaten/);
  await assert.rejects(()=>prepareDestination(file,'webm',data),/Endung/);
});
test('a changed target or unavailable folder never destroys an existing movie',async t=>{
  const {root,data,file}=await fixture(t),source=path.join(data,'render.mp4');
  await fs.writeFile(file,'old');await fs.writeFile(source,'new');
  const target=await prepareDestination(file,'mp4',data);
  await fs.writeFile(file,'edited while rendering');
  await assert.rejects(()=>saveDestination(source,target),/inzwischen geändert/);
  assert.equal(await fs.readFile(file,'utf8'),'edited while rendering');
  assert.ok(!(await fs.readdir(root)).some(x=>x.startsWith('.flightstudio-')));
  await assert.rejects(()=>prepareDestination(path.join(root,'missing','film.mp4'),'mp4',data),/ENOENT/);
});
test('destinations on drives without hard-link support use exclusive copying',async t=>{
  const {data,file}=await fixture(t),source=path.join(data,'render.mp4');
  await fs.writeFile(source,'USB export');const target=await prepareDestination(file,'mp4',data);
  const original=fs.link;
  fs.link=async()=>{throw Object.assign(new Error('Unsupported filesystem'),{code:'ENOSYS'});};
  try{await saveDestination(source,target);}finally{fs.link=original;}
  assert.equal(await fs.readFile(file,'utf8'),'USB export');
});
test('completed renders save automatically, survive reload, and retry a failed destination without a new render',async t=>{
  const {root,data,file}=await fixture(t),manager=new ExportJobs(path.join(data,'exports'),'unused',async()=>{});
  await manager.init();t.after(()=>clearInterval(manager.timer));
  const target=await prepareDestination(file,'mp4',data);
  const created=await manager.create({format:'mp4'},target),job=manager.get(created.id);
  await fs.writeFile(job.output,'rendered bytes');job.status='encoding';
  const states=[];manager.on('change',j=>states.push(j.status));
  await manager.complete(job);
  assert.deepEqual(states,['saving','done']);assert.equal(job.savedPath,file);
  assert.equal(await fs.readFile(file,'utf8'),'rendered bytes');
  const reopened=new ExportJobs(manager.directory,'unused',async()=>{});await reopened.init();t.after(()=>clearInterval(reopened.timer));
  assert.equal(reopened.list()[0].savedPath,file);
  const next=path.join(root,'missing-later');await fs.mkdir(next);
  const failing=await prepareDestination(path.join(next,'new.mp4'),'mp4',data);await fs.rmdir(next);
  await manager.saveAs(job.id,failing);assert.equal(job.status,'save-failed');assert.ok(manager.public(job).url);
  const recovery=await prepareDestination(path.join(root,'recovered.mp4'),'mp4',data);
  await manager.saveAs(job.id,recovery);assert.equal(job.status,'done');
  assert.equal(await fs.readFile(recovery.path,'utf8'),'rendered bytes');
});
test('cancel before completion leaves the destination unchanged; HTTP options cannot grant filesystem access',async t=>{
  const {data,file}=await fixture(t),manager=new ExportJobs(path.join(data,'exports'),'unused',async()=>{});
  await manager.init();t.after(()=>clearInterval(manager.timer));await fs.writeFile(file,'keep');
  manager.requireDestination=true;
  await assert.rejects(()=>manager.create({format:'mp4',destinationPath:file,destination:{path:file}}),/Speicherort/);
  const job=await manager.create({format:'mp4'},await prepareDestination(file,'mp4',data));
  await manager.cancel(job.id);assert.equal(await fs.readFile(file,'utf8'),'keep');
});
test('native save dialog cancellation creates no job; only its selected path is used',async t=>{
  const {data,file}=await fixture(t),calls=[];let result={canceled:true};
  const manager={directory:path.join(data,'exports'),active:[],create:async(options,target)=>{calls.push(target.path);return {id:'new'};}};
  const ui=exportDialogs({manager,dialog:{showSaveDialog:async(_win,options)=>{assert.deepEqual(options.filters[0].extensions,['mp4']);assert.equal(path.basename(options.defaultPath),'Evening flight.mp4');return result;}},window:()=>null,shell:{},defaultDirectory:path.dirname(file)});
  const options={name:'Evening flight',project:{name:'Test'},range:[0,1],format:'mp4',destinationPath:path.join(data,'evil.mp4')};
  assert.equal(await ui.start(options),null);assert.equal(calls.length,0);
  result={canceled:false,filePath:file};assert.equal((await ui.start(options)).id,'new');assert.deepEqual(calls,[file]);
});
test('fresh export view never selects an old completed movie, but resumes an active job',()=>{
  const old={id:'old',status:'done'},next={id:'new',status:'recording'};
  assert.equal(selectedExport([old],null),null);
  assert.equal(selectedExport([old],'old'),old);
  assert.equal(selectedExport([next,old],'old'),next);
});
test('browser destination receives streamed output and aborts on failed download',async t=>{
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  const chunks=[],target={stream:new WritableStream({write:chunk=>chunks.push(chunk)})};
  globalThis.fetch=async()=>new Response('movie bytes');
  await writeBrowserTarget(target,'/file');assert.equal(target.saved,true);
  assert.equal(Buffer.concat(chunks).toString(),'movie bytes');
  let aborted=false;
  globalThis.fetch=async()=>new Response('',{status:500});
  await assert.rejects(()=>writeBrowserTarget({stream:new WritableStream({abort:()=>aborted=true})},'/file'));
  assert.equal(aborted,true);
});
for(const format of ['mp4','webm'])test(`real ${format} frame export writes the selected destination automatically`,{timeout:30000},async t=>{
  const {root,data}=await fixture(t),manager=new ExportJobs(path.join(data,'exports'),ffmpeg,async()=>{});
  await manager.init();t.after(()=>clearInterval(manager.timer));
  let stopped=false;manager.launch=async()=>({stop(){stopped=true;}});
  const destination=path.join(root,'chosen.'+format);
  const target=await prepareDestination(destination,format,data);
  const project={version:2,name:'Synthetic export',assets:[],tracks:[{id:'v',visible:true}],
    clips:[{id:'title',trackId:'v',kind:'title',start:0,in:0,out:1,rate:1,text:'Test'}]};
  const job=await manager.create({name:'Evening flight',format,project,range:[0,1/24],size:720,fps:24,quality:'compact',audio:false,acceleration:'cpu'},target);
  assert.equal(manager.get(job.id).name,'Evening flight');
  assert.equal(project.name,'Synthetic export');
  await manager.scene(job.id);
  const frame=execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=1280x720','-frames:v','1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{windowsHide:true,maxBuffer:2e6});
  await manager.frame(job.id,0,frame);await manager.finish(job.id);
  for(let i=0;i<200&&manager.active.length;i++)await new Promise(r=>setTimeout(r,50));
  const result=manager.get(job.id);
  assert.equal(result.status,'done',result.error);assert.equal(result.savedPath,destination);assert.equal(stopped,true);
  assert.deepEqual(await fs.readFile(destination),await fs.readFile(result.output));
  const metadata=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_streams','-of','json',destination],{windowsHide:true,encoding:'utf8'}));
  assert.equal(metadata.streams[0].width,1280);assert.equal(metadata.streams[0].height,720);
});

test('export names require an explicit usable filename while preserving Unicode',()=>{
  assert.equal(filmName('  Über den Bergen.mp4  '),'Über den Bergen');
  for(const value of ['', '  ', '.webm', 'flight/name', 'CON', 'x'.repeat(121)])assert.throws(()=>filmName(value));
});
test('invalid explicit film names cannot start a backend job',async t=>{
  const {data}=await fixture(t),manager=new ExportJobs(path.join(data,'exports'),'unused',async()=>{});
  await manager.init();t.after(()=>clearInterval(manager.timer));
  await assert.rejects(()=>manager.create({format:'mp4',name:'   '}),/Namen/);
  assert.equal(manager.list().length,0);
});
