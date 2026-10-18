import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {demoFlight} from '../lib/flight.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dir=path.join(root,'examples');await fs.mkdir(dir,{recursive:true});
const run=args=>new Promise((resolve,reject)=>{const p=spawn(ffmpeg,args,{windowsHide:true});let err='';p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code?reject(new Error(err)):resolve());});
const p=n=>String(n).padStart(2,'0'),alt=n=>String(Math.round(n)).padStart(5,'0'),coord=(v,d)=>{let deg=Math.floor(Math.abs(v)),min=Math.round((Math.abs(v)-deg)*60000);if(min===60000){deg++;min=0;}return String(deg).padStart(d,'0')+String(min).padStart(5,'0');};
const flight=demoFlight(),lines=['AXXXFLIGHTSTUDIO','HFDTE010624','HFPLTPILOTINCHARGE:FlightStudio synthetic demo','HFGTYGLIDERTYPE:Test'];
for(const x of flight.points){const dt=new Date(x.time);lines.push('B'+p(dt.getUTCHours())+p(dt.getUTCMinutes())+p(dt.getUTCSeconds())+coord(x.lat,2)+(x.lat<0?'S':'N')+coord(x.lon,3)+(x.lon<0?'W':'E')+'A'+alt(x.alt)+alt(x.alt));}await fs.writeFile(path.join(dir,'Demo-Flug.igc'),lines.join('\r\n'));
const comparison=['AXXXFLIGHTSTUDIO','HFDTE010624','HFPLTPILOTINCHARGE:Synthetic comparison','HFGTYGLIDERTYPE:Test'];
for(const x of flight.points){const dt=new Date(x.time+20000);comparison.push('B'+p(dt.getUTCHours())+p(dt.getUTCMinutes())+p(dt.getUTCSeconds())+coord(x.lat+.004,2)+'N'+coord(x.lon+.005,3)+'EA'+alt(x.alt+100)+alt(x.alt+100));}await fs.writeFile(path.join(dir,'Demo-Flug-B.igc'),comparison.join('\r\n'));

await run(['-y','-v','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libx264','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-metadata','creation_time=2024-06-01T10:11:00Z','-movflags','+faststart',path.join(dir,'Demo-Video.mp4')]);
await run(['-y','-v','error','-i',path.join(dir,'Demo-Video.mp4'),'-vf','hue=h=110,vflip','-c:v','libx264','-preset','fast','-crf','24','-c:a','copy','-metadata','creation_time=2024-06-01T10:11:00Z',path.join(dir,'Demo-Video-B.mp4')]);
await run(['-y','-v','error','-f','lavfi','-i','color=c=0x3b6575:s=1280x720','-vf','drawgrid=width=100:height=100:thickness=2:color=0x8abaaa','-frames:v','1','-q:v','2',path.join(dir,'Demo-Foto.jpg')]);
// Tiny valid EXIF block gives the test photo an actual capture timestamp.
const text=Buffer.from('2024:06:01 12:11:14\0','ascii'),tiff=Buffer.alloc(26+text.length);tiff.write('II');tiff.writeUInt16LE(42,2);tiff.writeUInt32LE(8,4);tiff.writeUInt16LE(1,8);tiff.writeUInt16LE(0x0132,10);tiff.writeUInt16LE(2,12);tiff.writeUInt32LE(text.length,14);tiff.writeUInt32LE(26,18);text.copy(tiff,26);
// Real ExifIFD DateTimeOriginal tag, rather than a file modification date.
const exif=Buffer.alloc(44+text.length);exif.write('II');exif.writeUInt16LE(42,2);exif.writeUInt32LE(8,4);exif.writeUInt16LE(1,8);exif.writeUInt16LE(0x8769,10);exif.writeUInt16LE(4,12);exif.writeUInt32LE(1,14);exif.writeUInt32LE(26,18);exif.writeUInt16LE(1,26);exif.writeUInt16LE(0x9003,28);exif.writeUInt16LE(2,30);exif.writeUInt32LE(text.length,32);exif.writeUInt32LE(44,36);text.copy(exif,44);
const payload=Buffer.concat([Buffer.from('Exif\0\0'),exif]),header=Buffer.alloc(4);header.writeUInt16BE(0xffe1,0);header.writeUInt16BE(payload.length+2,2);const photo=await fs.readFile(path.join(dir,'Demo-Foto.jpg'));await fs.writeFile(path.join(dir,'Demo-Foto.jpg'),Buffer.concat([photo.subarray(0,2),header,payload,photo.subarray(2)]));
console.log('Testdateien bereit: Demo-Flug.igc, Demo-Video.mp4 (12 s mit Ton), Demo-Foto.jpg (EXIF).');
