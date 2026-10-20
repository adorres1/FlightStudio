import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VideoEncoder,encoderArgs} from '../lib/video-encoder.mjs';
import {exportSettings} from '../lib/export-settings.mjs';
test('actual hardware encoding probes use export dimensions, cache successes and fall back safely',async()=>{
  const calls=[];
  const encoder=new VideoEncoder('unused',async args=>{calls.push(args);return args[args.indexOf('-c:v')+1]==='h264_nvenc';});
  const opts=exportSettings({size:2160,fps:60,quality:'high',format:'mp4'});
  assert.equal(await encoder.select(opts,'9:16'),'h264_nvenc');
  assert.equal(calls.length,2);assert.ok(calls[0].includes('color=c=black:s=2160x3840:r=60'));
  assert.equal(await encoder.select(opts,'9:16'),'h264_nvenc');assert.equal(calls.length,2);
  assert.equal(await encoder.select({...opts,acceleration:'cpu'}),'libx264');
  assert.equal(await encoder.select({...opts,format:'webm'}),'libvpx-vp9');assert.equal(calls.length,2);
  assert.equal(await new VideoEncoder('unused',async()=>false).select(opts),'libx264');
  assert.throws(()=>exportSettings({acceleration:'unknown'}));
  assert.ok(encoderArgs('libx264','high').includes('16'));
});
