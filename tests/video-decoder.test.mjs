import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {VideoDecoder} from '../lib/video-decoder.mjs';

test('sequential decoder preserves source frames, VFR timing, repeated slow-motion frames and trimmed seeks',{timeout:60000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flightstudio-decoder-'));
  const decoders=[];t.after(async()=>{for(const d of decoders)d.stop();await new Promise(r=>setTimeout(r,200));await fs.rm(dir,{recursive:true,force:true});});
  const file=path.join(dir,'timed.mp4');
  execFileSync(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=4',
    '-vf',"setpts=if(lt(N\\,10)\\,N/(10*TB)\\,(N-10)/(5*TB)+1/TB)",'-fps_mode','vfr',
    '-c:v','libx264','-pix_fmt','yuv420p','-g','30',file],{windowsHide:true});
  const frames=JSON.parse(execFileSync(ffprobe.path,['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',file],{windowsHide:true})).frames.map(f=>Number(f.best_effort_timestamp_time));
  assert.ok(frames.some((v,i)=>i&&v-frames[i-1]>.15));
  const decoder=new VideoDecoder(ffmpeg,file);decoders.push(decoder);
  for(const time of [0,.05,.1,.35,.6,1.15,1.2,1.9,4.21,4.23,.25,6.79]){
    const index=frames.findLastIndex(pts=>pts<=time+1e-6);
    const expected=execFileSync(ffmpeg,['-v','error','-i',file,'-vf',`select=eq(n\\,${index}),scale=out_color_matrix=bt601:out_range=full,format=yuvj420p`,
      '-frames:v','1','-an','-c:v','mjpeg','-q:v','2','-threads','1','-f','image2pipe','pipe:1'],{windowsHide:true});
    const actual=await decoder.frame(time);
    assert.deepEqual(actual,expected,`wrong source frame at ${time}`);
    assert.ok(decoder.timestamps.length<2048);
  }
  await assert.rejects(()=>decoder.frame(-1));
  const missing=new VideoDecoder(ffmpeg,path.join(dir,'missing.mp4'));decoders.push(missing);
  await assert.rejects(()=>missing.frame(0),/decoder|frame/i);
});
