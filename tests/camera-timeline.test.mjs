import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraAt,cameraWindow,putCameraFrame,migrateCameraTiming,TOP_VIEW} from '../lib/camera.mjs';
import {alignedMedia,timelineTrackHeight,end,playbackIntervals,outputDuration,advancePlayback} from '../lib/timeline.mjs';
const initial={lon:7,lat:46,height:4000,heading:TOP_VIEW.heading,pitch:TOP_VIEW.pitch,roll:0},target={...initial,height:2000,pitch:-.6};
test('the first late camera change keeps top view until the incoming transition and arrives at its timestamp',()=>{
  const frames=putCameraFrame([],{time:30000,duration:5,pose:target});
  assert.equal(frames.length,1);assert.equal(frames[0].time,30000);
  assert.deepEqual(cameraAt(0,frames,initial),initial);assert.deepEqual(cameraAt(25000,frames,initial),initial);
  assert.equal(cameraAt(27500,frames,initial).height,3000);assert.deepEqual(cameraAt(30000,frames,initial),target);
  assert.deepEqual(cameraAt(45000,frames,initial),target);
});
test('the starting view is explicit, same-time edits replace it, and deleting it restores top view',()=>{
  const frames=putCameraFrame(putCameraFrame([],{time:0,duration:5,pose:target}),{time:0,duration:10,pose:{...target,height:3500}});
  assert.equal(frames.length,1);assert.equal(frames[0].duration,0);assert.equal(cameraAt(0,frames,initial).height,3500);
  assert.deepEqual(cameraAt(0,[],initial),initial);
});
test('camera transitions are shortened at the beginning and between close target points',()=>{
  const frames=[{time:2000,duration:5,pose:target},{time:3000,duration:5,pose:initial}];
  assert.deepEqual(cameraWindow(frames[0],frames),{start:0,end:2000});
  assert.deepEqual(cameraWindow(frames[1],frames),{start:2000,end:3000});
  assert.equal(cameraAt(1000,frames,initial).height,3000);assert.equal(cameraAt(2500,frames,initial).height,3000);
});
test('old departure timestamps migrate to arrival times through accelerated intervals exactly once',()=>{
  const spans=[{start:0,end:10,rate:1},{start:10,end:110,rate:50},{start:110,end:120,rate:1}];
  const old={frames:[{time:10000,duration:5,pose:target}]},before=JSON.stringify(old);
  const migrated=migrateCameraTiming(old,t=>outputDuration(spans,0,t/1000)*1000,t=>advancePlayback(spans,0,t/1000)*1000);
  assert.equal(migrated.frames[0].time,113000);assert.equal(JSON.stringify(old),before);
  assert.equal(migrateCameraTiming(migrated,()=>{throw Error('twice');},()=>0),migrated);
});
const asset={id:'camera',type:'video',duration:30},flight={start:100000,end:700000};
const fc={kind:'flight',trackId:'f',start:0,in:0,out:600,rate:1};
test('a clip crossing the IGC end keeps its complete tail, and nearby later footage keeps the real gap',()=>{
  const crossing=alignedMedia(asset,flight.start+590000,flight,[fc],'v');
  assert.equal(crossing.clips.length,1);assert.equal(crossing.clips[0].start,590);assert.equal(crossing.clips[0].out,30);assert.equal(end(crossing.clips[0]),620);
  const later=alignedMedia(asset,flight.end+30000,flight,[fc],'v');assert.equal(later.clips[0].start,630);
});
test('footage before takeoff prepends room without trimming its beginning or losing synchronization',()=>{
  const before=alignedMedia(asset,flight.start-10000,flight,[fc],'v');
  assert.equal(before.prepend,10);assert.equal(before.clips.length,1);assert.equal(before.clips[0].start,0);assert.equal(before.clips[0].in,0);assert.equal(before.clips[0].out,30);
  const shifted={...fc,start:10};const second=alignedMedia(asset,flight.start-5000,flight,[shifted],'v');
  assert.equal(second.prepend,0);assert.equal(second.clips[0].start,5);
});
test('timestamps hours away go to the recording edges without hours of empty timeline',()=>{
  const later=alignedMedia(asset,flight.end+7200000,flight,[fc],'v');assert.equal(later.clips[0].start,600);
  const before=alignedMedia(asset,flight.start-7200000,flight,[fc],'v');assert.equal(before.prepend,30);assert.equal(before.clips[0].start,0);
});
test('edge footage respects edited flight timing and remains unaccelerated outside the flight',()=>{
  const clipped={...fc,rate:10},result=alignedMedia(asset,flight.start+590000,flight,[clipped],'v');
  assert.deepEqual(result.clips.map(c=>[c.start,c.in,c.out,c.rate]),[[59,0,10,10],[60,10,30,1]]);
  const spans=playbackIntervals({clips:[fc,...alignedMedia(asset,flight.end+30000,flight,[fc],'v').clips],tracks:[{id:'f',visible:true},{id:'v',visible:true}],gaps:{enabled:true,speed:50}});
  assert.equal(outputDuration(spans,600,660),60);
});
test('tracks shrink to fit before scrolling, with a minimum height that keeps labels usable',()=>{
  assert.equal(timelineTrackHeight(180,2),62);assert.equal(timelineTrackHeight(180,5),36);
  assert.equal(timelineTrackHeight(180,6),30);assert.equal(timelineTrackHeight(180,7),26);assert.equal(timelineTrackHeight(180,20),26);
});
