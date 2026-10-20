import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import Busboy from 'busboy';
import exifr from 'exifr';
import ffmpegPath from 'ffmpeg-static';
import { ExportJobs } from './lib/export-jobs.mjs';
const ffmpeg=ffmpegPath?.replace('app.asar', 'app.asar.unpacked');
import ffprobe from 'ffprobe-static';
import {unzipSync} from 'fflate';
import {parseIGC,demoFlight} from './lib/flight.mjs';
import {parseKML} from './lib/kml.mjs';
import {chooseCaptureTag} from './lib/time.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=process.env.FLIGHTSTUDIO_DATA_DIR||path.join(ROOT,'data'),MEDIA=path.join(DATA,'media'),EXPORTS=path.join(DATA,'exports');
await Promise.all([fsp.mkdir(MEDIA,{recursive:true}),fsp.mkdir(EXPORTS,{recursive:true})]);
let PORT=Number(process.env.PORT||4187);
const TOKEN=randomBytes(24).toString('hex'),thumbnails=new Map();
export const exportJobs=new ExportJobs(EXPORTS,ffmpeg,getMedia);
await exportJobs.init();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.mp4':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.flac':'audio/flac','.mov':'video/quicktime','.webm':'video/webm','.woff2':'font/woff2','.wasm':'application/wasm','.gif':'image/gif','.ico':'image/x-icon'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function body(req,max=50*1024*1024){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)throw new Error('Datei oder Anfrage zu gross.');chunks.push(c);}return Buffer.concat(chunks);}
async function readJSON(req){return JSON.parse((await body(req)).toString('utf8'));}
function run(exe,args,timeout=0){return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{windowsHide:true});let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err=(err+d).slice(-5000));
  const timer=timeout?setTimeout(()=>{child.kill();reject(new Error('Die Mediendatei konnte nicht rechtzeitig gelesen werden.'));},timeout):null;
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(out):reject(new Error(err||'Medienverarbeitung fehlgeschlagen.'));});
});}
async function upload(req,limit=32*1024**3){
  const id=randomUUID(),target=path.join(MEDIA,id+'.upload');let info,promise,limited=false;
  const parser=Busboy({headers:req.headers,limits:{files:1,fileSize:limit,fields:2}});
  const done=new Promise((resolve,reject)=>{parser.on('file',(field,stream,meta)=>{
    info={id,name:path.basename(meta.filename),mime:meta.mimeType,path:target};
    stream.on('limit',()=>limited=true);promise=pipeline(stream,fs.createWriteStream(target));promise.catch(()=>{});
  });parser.on('error',reject);parser.on('close',resolve);req.on('aborted',()=>reject(new Error('Import abgebrochen.')));});
  req.pipe(parser);
  try{await done;await promise;if(!info)throw new Error('Keine Datei ausgewählt.');if(limited)throw new Error('Die Datei überschreitet das Importlimit.');return info;}
  catch(e){await fsp.rm(target,{force:true});throw e;}
}
async function getMedia(id){if(!uuid.test(id))throw new Error('Ungültige Medien-ID.');return JSON.parse(await fsp.readFile(path.join(MEDIA,id+'.json'),'utf8'));}
async function inspectMedia(info){
  const ext=path.extname(info.name).toLowerCase(),photo=['.jpg','.jpeg','.png','.webp','.avif'].includes(ext),video=['.mp4','.mov','.m4v','.webm','.mkv'].includes(ext);
  const audioOnly=['.mp3','.wav','.m4a','.aac','.ogg','.flac'].includes(ext);
  if(!photo&&!video&&!audioOnly)throw new Error('Unterstützt: MP4, MOV, WebM, JPG, PNG sowie MP3, WAV, M4A, AAC, OGG und FLAC.');
  const probe=JSON.parse(await run(ffprobe.path.replace('app.asar', 'app.asar.unpacked'),['-v','error','-show_format','-show_streams','-of','json',info.path],30000));
  const stream=probe.streams?.find(s=>s.codec_type===(audioOnly?'audio':'video'));if(!stream)throw new Error('Keine lesbare Bild-, Video- oder Audiospur gefunden.');
  let capture=null;
  if(photo){
    const tags=await exifr.parse(info.path,{reviveValues:false,pick:['DateTimeOriginal','CreateDate','OffsetTimeOriginal','OffsetTimeDigitized']}).catch(()=>null);
    const value=tags?.DateTimeOriginal||tags?.CreateDate,offset=tags?.OffsetTimeOriginal||tags?.OffsetTimeDigitized||'';
    if(value)capture={raw:String(value)+offset,source:tags.DateTimeOriginal?'EXIF DateTimeOriginal':'EXIF CreateDate',explicitZone:Boolean(offset)};
  }else capture=chooseCaptureTag({...stream.tags,...probe.format?.tags});
  const filename=info.id+ext;await fsp.rename(info.path,path.join(MEDIA,filename));
  const item={id:info.id,name:info.name,filename,type:photo?'photo':audioOnly?'audio':'video',url:'/media/'+info.id,duration:photo?5:Number(probe.format?.duration||stream.duration)||0,width:stream.width||0,height:stream.height||0,codec:stream.codec_name,audio:probe.streams.some(s=>s.codec_type==='audio'),capture};
  if(!photo&&!item.duration)throw new Error('Die Mediendauer konnte nicht ermittelt werden.');
  await fsp.writeFile(path.join(MEDIA,info.id+'.json'),JSON.stringify(item));return item;
}
async function serveFile(req,res,file,download){
  const stat=await fsp.stat(file);if(!stat.isFile())throw Object.assign(new Error('Nicht gefunden.'),{status:404});
  let start=0,end=stat.size-1,status=200;const range=req.headers.range;
  if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
    if(!m[1])start=Math.max(0,stat.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(Number(m[2]),end);}
    if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}status=206;
  }
  const headers={'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-cache'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  if(download)headers['Content-Disposition']=`attachment; filename="${download}"`;
  res.writeHead(status,headers);if(req.method==='HEAD')res.end();else await pipeline(fs.createReadStream(file,{start,end}),res);
}
let saveQueue=Promise.resolve();
export const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const allowed=new Set([`127.0.0.1:${PORT}`,`localhost:${PORT}`]);
  if(!allowed.has(req.headers.host)){json(res,403,{error:'Nur lokaler Zugriff erlaubt.'});return;}
  const url=new URL(req.url,`http://127.0.0.1:${PORT}`),route=url.pathname;
  if(!['GET','HEAD'].includes(req.method)&&req.headers['x-flightstudio-token']!==TOKEN){json(res,403,{error:'Bitte die Anwendung neu laden.'});return;}
  try{
    if(req.method==='GET'&&route==='/api/status'){json(res,200,{app:'FlightStudioV2',version:'2.4.0',backgroundExport:Boolean(exportJobs.launch),desktop:Boolean(process.versions.electron),token:TOKEN,ffmpeg:Boolean(ffmpeg&&fs.existsSync(ffmpeg)),dataPath:DATA});return;}
    if(req.method==='GET'&&route==='/api/demo'){json(res,200,demoFlight());return;}
    if(req.method==='POST'&&route==='/api/flight'){
      const info=await upload(req,50*1024**2);try{
        let buffer=await fsp.readFile(info.path),ext=path.extname(info.name).toLowerCase();
        if(ext==='.kmz'){const entries=unzipSync(buffer,{filter:f=>/\.kml$/i.test(f.name)&&f.originalSize<=50*1024**2});const key=Object.keys(entries).find(n=>/(^|\/)doc\.kml$/i.test(n))||Object.keys(entries)[0];if(!key)throw new Error('Keine lesbare KML-Datei im KMZ-Archiv.');buffer=Buffer.from(entries[key]);ext='.kml';}
        if(!['.igc','.kml'].includes(ext))throw new Error('Bitte IGC, KML oder KMZ auswählen.');
        json(res,200,ext==='.igc'?parseIGC(buffer.toString('utf8'),info.name):parseKML(buffer.toString('utf8'),info.name));
      }finally{await fsp.rm(info.path,{force:true});}return;
    }
    if(req.method==='POST'&&route==='/api/media'){const info=await upload(req);try{json(res,200,await inspectMedia(info));}catch(e){await fsp.rm(info.path,{force:true});throw e;}return;}
    if(req.method==='GET'&&route==='/api/media'){
      const files=(await fsp.readdir(MEDIA)).filter(n=>n.endsWith('.json'));const items=await Promise.all(files.map(f=>fsp.readFile(path.join(MEDIA,f),'utf8').then(JSON.parse)));json(res,200,items);return;
    }
    if(route.startsWith('/media/')&&['GET','HEAD'].includes(req.method)){const item=await getMedia(route.slice(7));await serveFile(req,res,path.join(MEDIA,item.filename));return;}
    if(route.startsWith('/thumb/')&&req.method==='GET'){
      const item=await getMedia(route.slice(7)),target=path.join(MEDIA,item.id+'.thumb.jpg');
      if(!fs.existsSync(target)){if(!thumbnails.has(item.id))thumbnails.set(item.id,run(ffmpeg,['-y','-v','error','-i',path.join(MEDIA,item.filename),'-frames:v','1','-vf','scale=320:-2','-q:v','5',target],30000).finally(()=>thumbnails.delete(item.id)));await thumbnails.get(item.id);}
      await serveFile(req,res,target);return;
    }
    if(route==='/api/project'&&req.method==='GET'){json(res,200,await fsp.readFile(path.join(DATA,'project.json'),'utf8').then(JSON.parse).catch(()=>null));return;}
    if(route==='/api/project'&&req.method==='PUT'){
      const project=await readJSON(req);if(project.version!==2)throw new Error('Unbekanntes Projektformat.');
      saveQueue=saveQueue.catch(()=>{}).then(async()=>{const tmp=path.join(DATA,'project.tmp');await fsp.writeFile(tmp,JSON.stringify(project));await fsp.rename(tmp,path.join(DATA,'project.json'));});await saveQueue;json(res,200,{ok:true});return;
    }
    if(route==='/api/exports'&&req.method==='GET'){json(res,200,exportJobs.list());return;}
    if(route==='/api/exports'&&req.method==='POST'){json(res,200,await exportJobs.create(await readJSON(req)));return;}
    const match=route.match(/^\/api\/exports\/([0-9a-f-]+)(?:\/(scene|progress|fail|finish|cancel|file|chunks\/\d+|frames\/\d+))?$/);
    if(match){
      const job=exportJobs.get(match[1]), action=match[2];
      if(!action&&req.method==='GET'){json(res,200,exportJobs.public(job));return;}
      if(action==='scene'&&req.method==='GET'){json(res,200,await exportJobs.scene(job.id));return;}
      if(action?.startsWith('chunks/')&&req.method==='PUT'){await exportJobs.chunk(job.id,Number(action.slice(7)),await body(req,64*1024**2));json(res,200,{ok:true});return;}
      if(action?.startsWith('frames/')&&req.method==='PUT'){await exportJobs.frame(job.id,Number(action.slice(7)),await body(req,32*1024**2));json(res,200,{ok:true});return;}
      if(action==='progress'&&req.method==='POST'){await exportJobs.progress(job.id,(await readJSON(req)).progress);json(res,200,{ok:true});return;}
      if(action==='fail'&&req.method==='POST'){await exportJobs.fail(job.id,(await readJSON(req)).error);json(res,200,{ok:true});return;}
      if(action==='finish'&&req.method==='POST'){await exportJobs.finish(job.id);json(res,200,{status:job.status});return;}
      if(action==='cancel'&&req.method==='POST'){await exportJobs.cancel(job.id);json(res,200,{ok:true});return;}
      if(action==='file'&&['GET','HEAD'].includes(req.method)&&job.status==='done'){await serveFile(req,res,job.output,'FlightStudio-'+job.id.slice(0,8)+'.'+job.format);return;}
    }
    if(route==='/api/shutdown'&&req.method==='POST'){
      if(exportJobs.active.length)throw new Error('Ein Export läuft noch. Bitte abschliessen oder abbrechen.');
      json(res,200,{ok:true});server.close();setTimeout(()=>process.exit(0),300);return;
    }
    if(!['GET','HEAD'].includes(req.method))throw Object.assign(new Error('Nicht gefunden.'),{status:404});
    let base=path.join(ROOT,'public'),relative=decodeURIComponent(route==='/'?'/studio.html':route);
    if(route.startsWith('/examples/')){base=path.join(ROOT,'examples');relative=route.slice('/examples'.length);}
    if(route.startsWith('/cesium/')){base=path.join(ROOT,'node_modules','cesium','Build','Cesium');relative=decodeURIComponent(route.slice(7));}
    else if(route==='/vendor/luxon.js'){await serveFile(req,res,path.join(ROOT,'node_modules','luxon','build','es6','luxon.mjs'));return;}
    else if(['/lib/flight.mjs','/lib/instruments.mjs','/lib/igc-fields.mjs','/lib/time.mjs','/lib/camera.mjs','/lib/edit.mjs','/lib/timeline.mjs','/lib/flight-overlays.mjs','/lib/export-settings.mjs','/lib/clip-effects.mjs'].includes(route)){base=ROOT;}
    const file=path.resolve(base,'.'+relative);if(!file.startsWith(base+path.sep))throw new Error('Ungültiger Pfad.');await serveFile(req,res,file);
  }catch(e){if(!res.headersSent)json(res,e.status||(e.code==='ENOENT'?404:400),{error:e.code==='ENOENT'?'Datei nicht gefunden.':e.message});else res.destroy();}
});
server.requestTimeout=0;
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`FlightStudio läuft bereits auf http://127.0.0.1:${PORT}`:e.message);process.exitCode=1;});
export const ready = new Promise(resolve => server.listen(PORT,'127.0.0.1',()=>{ PORT=server.address().port; console.log(`FlightStudio bereit: http://127.0.0.1:${PORT}\nDateien und Exporte: ${DATA}`); resolve(`http://127.0.0.1:${PORT}`); }));
if (!process.versions.electron) {
  try {
    const { default: electron } = await import('electron');
    exportJobs.launch = async id => {
      const base = await ready;
      const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(electron, [path.join(ROOT,'desktop','main.cjs'), '--render-worker', base + '/?renderJob=' + id], { windowsHide:true, env, stdio:'ignore' });
      child.on('error', e => void exportJobs.fail(id, e.message));
      child.on('exit', () => void exportJobs.fail(id, 'Der Hintergrundexport wurde unerwartet beendet.'));
      return { stop: () => child.kill() };
    };
  } catch { /* Browser-only package retains its visible-tab export. */ }
}
