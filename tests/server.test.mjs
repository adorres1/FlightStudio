import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('Local server: imports, timestamps, byte ranges, access protection and MP4 conversion',{timeout:120000},async t=>{
  await fs.mkdir(path.join(root,'data'),{recursive:true});
  const data=await fs.mkdtemp(path.join(root,'data','qa-')),port=4280+Math.floor(Math.random()*100),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),FLIGHTSTUDIO_DATA_DIR:data},windowsHide:true,stdio:'pipe'});let logs='';child.stderr.on('data',d=>logs+=d);t.after(()=>child.kill());
  let status;for(let i=0;i<80;i++){try{status=await fetch(base+'/api/status').then(r=>r.json());break;}catch{await new Promise(r=>setTimeout(r,80));}}assert.equal(status?.app,'FlightStudioV2',logs);
  const call=async(route,options={})=>{const response=await fetch(base+route,{...options,headers:{'X-FlightStudio-Token':status.token,...options.headers}});const payload=await response.json();assert.ok(response.ok,JSON.stringify(payload));return payload;};
  assert.match(await fetch(base+'/').then(r=>r.text()),/studio\.mjs/);
  assert.equal((await fetch(base+'/examples/Demo-Video-B.mp4',{method:'HEAD'})).status,200);
  const upload=async(route,name)=>{const form=new FormData();form.append('file',new Blob([await fs.readFile(path.join(root,'examples',name))]),name);return call(route,{method:'POST',body:form});};
  assert.equal((await fetch(base+'/api/exports',{method:'POST'})).status,403);
  assert.equal((await fetch(base+'/data/project.json')).status,404);
  const flight=await upload('/api/flight','Demo-Flug.igc');assert.equal(flight.points.length,721);assert.equal(flight.start,Date.UTC(2024,5,1,10,10));
  const video=await upload('/api/media','Demo-Video.mp4');assert.equal(video.type,'video');assert.equal(Date.parse(video.capture.raw),Date.UTC(2024,5,1,10,11));assert.equal(video.audio,true);
  const photo=await upload('/api/media','Demo-Foto.jpg');assert.equal(photo.capture.raw,'2024:06:01 12:11:14');
  const audioPath=path.join(data,'tone.m4a');execFileSync(ffmpeg,['-y','-v','error','-i',path.join(root,'examples','Demo-Video.mp4'),'-t','1','-vn','-c:a','aac',audioPath],{windowsHide:true});
  const audioForm=new FormData();audioForm.append('file',new Blob([await fs.readFile(audioPath)]),'tone.m4a');
  const audio=await call('/api/media',{method:'POST',body:audioForm});assert.equal(audio.type,'audio');assert.equal(audio.audio,true);assert.equal(audio.width,0);assert.equal((await fetch(base+audio.url,{method:'HEAD'})).headers.get('content-type'),'audio/mp4');
  const project={version:2,name:'Video ohne Flug',assets:[video,audio],flight:null,tracks:[{id:'video',visible:true},{id:'audio',visible:true}],clips:[{id:'clip',assetId:video.id,kind:'video',trackId:'video',start:0,in:0,out:1,rate:1},{id:'sound',assetId:audio.id,kind:'audio',trackId:'audio',start:0,in:0,out:1,rate:1}]};
  await call('/api/project',{method:'PUT',body:JSON.stringify(project)});assert.deepEqual(await call('/api/project'),project);
  const range=await fetch(base+video.url,{headers:{Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);assert.equal((await fetch(base+video.url,{headers:{Range:'bytes=999999999999-'}})).status,416);
  const webm=path.join(data,'test.webm');execFileSync(ffmpeg,['-y','-v','error','-i',path.join(root,'examples','Demo-Video.mp4'),'-t','1','-c:v','libvpx','-deadline','realtime','-cpu-used','8','-c:a','libopus',webm],{windowsHide:true});
  const job=await call('/api/exports',{method:'POST',body:JSON.stringify({format:'mp4'})}),bytes=await fs.readFile(webm),middle=Math.floor(bytes.length/2);
  await call(`/api/exports/${job.id}/chunks/0`,{method:'PUT',body:bytes.subarray(0,middle)});await call(`/api/exports/${job.id}/chunks/1`,{method:'PUT',body:bytes.subarray(middle)});await call(`/api/exports/${job.id}/finish`,{method:'POST'});
  let result;for(let i=0;i<120;i++){result=await call(`/api/exports/${job.id}`);if(['done','failed'].includes(result.status))break;await new Promise(r=>setTimeout(r,150));}assert.equal(result.status,'done',result.error);
  const info=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',path.join(data,'exports',job.id+'.mp4')],{windowsHide:true}));
  assert.ok(Math.abs(Number(info.format.duration)-1)<.15);assert.equal(info.streams[0].codec_name,'h264');assert.equal(info.streams[0].width,1280);assert.equal(info.streams[0].avg_frame_rate,'30/1');assert.equal(info.streams[1].codec_name,'aac');assert.equal((await fetch(base+result.url)).status,200);
  // A native worker renders with no editor tab at all. It owns a frozen project.
  if(status.backgroundExport){
    project.gaps={enabled:false,speed:50,explicit:true};
    project.clips[0].out=2;project.clips=project.clips.slice(0,1);
    const background=await call('/api/exports',{method:'POST',body:JSON.stringify({format:'webm',size:720,audio:true,range:[0,2],project})});
    let exported;
    for(let i=0;i<200;i++){exported=await call(`/api/exports/${background.id}`);if(['done','failed'].includes(exported.status))break;await new Promise(r=>setTimeout(r,150));}
    assert.equal(exported.status,'done',exported.error);
    const output=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',path.join(data,'exports',background.id+'.webm')],{windowsHide:true}));
    assert.ok(Math.abs(Number(output.format.duration)-2)<.35,output.format.duration);
    assert.equal(output.streams[0].width,1280);assert.ok(output.streams.some(s=>s.codec_type==='audio'));
    assert.equal((await call('/api/exports'))[0].id,background.id);
    const sixty=await call('/api/exports',{method:'POST',body:JSON.stringify({format:'mp4',size:720,fps:60,quality:'high',audio:true,range:[0,.5],project})});
    let result60;
    for(let i=0;i<400;i++){result60=await call('/api/exports/'+sixty.id);if(['done','failed'].includes(result60.status))break;await new Promise(r=>setTimeout(r,150));}
    assert.equal(result60.status,'done',result60.error);
    const exact=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',path.join(data,'exports',sixty.id+'.mp4')],{windowsHide:true}));
    assert.equal(exact.streams[0].avg_frame_rate,'60/1');
    assert.equal(exact.streams[0].nb_frames,'30');
    assert.equal(Number(exact.format.duration),.5);
    assert.ok(exact.streams.some(s=>s.codec_type==='audio'));

  }
});
