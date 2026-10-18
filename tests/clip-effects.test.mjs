import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTransition,transitionFor,effectScene,audioGain,imagePlacement,connectOverlap} from '../lib/clip-effects.mjs';
import {normalizedRect,validateProject,splitClip,playbackIntervals} from '../lib/timeline.mjs';
import {audioSegments} from '../lib/audio-plan.mjs';
import {flightReadouts} from '../lib/flight-overlays.mjs';
import {demoFlight} from '../lib/flight.mjs';

const clip=(id,start,extra={})=>({id,assetId:id,trackId:'v',kind:'video',start,in:0,out:10,rate:1,...extra});
const tracks=[{id:'v',visible:true},{id:'map',visible:true}];
test('a dissolve uses real frames, one layout tile and does not move the flight track',()=>{
  const a=clip('a',0),b=clip('b',10),flight=clip('f',0,{kind:'flight',trackId:'map',out:30});
  const changed=applyTransition([a,b,flight],b,'dissolve',2),clips=[a,changed,flight];
  assert.equal(changed.start,8);assert.equal(changed.in,0);assert.equal(changed.out,10);assert.equal(flight.start,0);
  assert.equal(transitionFor(clips,changed).duration,2);
  const scene=effectScene(clips,tracks,9,'grid');
  assert.deepEqual(scene.layers.map(c=>c.id),['a','b','f']);
  assert.deepEqual(scene.rects.get('a'),scene.rects.get('b'));assert.equal(scene.rects.get('b').w,.5);
  assert.deepEqual(effectScene(clips,tracks,10,'grid').layers.map(c=>c.id),['b','f']);
});
test('moving clips into an overlap connects them; invalid or deleted partners do not leave a phantom transition',()=>{
  const a=clip('a',0),b=clip('b',8),next=connectOverlap([a,b],b);
  assert.equal(next.transitionIn.fromId,'a');assert.equal(transitionFor([next],next),null);
  assert.equal(transitionFor([a,{...next,start:12}],{...next,start:12}),null);
  assert.throws(()=>applyTransition([a,b,clip('third',9)],b,'wipe',2),/dritten Clip/);
  assert.equal(transitionFor([a,{...next,enabled:false}],{...next,enabled:false}),null);
});
test('transition audio gains complement each other; explicit audio fades are independent of visual fades',()=>{
  const a=clip('a',0),b=applyTransition([a,clip('b',10)],clip('b',10),'dissolve',2),clips=[a,b];
  assert.equal(audioGain(clips,a,9),.5);assert.equal(audioGain(clips,b,9),.5);
  b.fadeIn=4;b.audioFadeIn=0;assert.equal(audioGain(clips,b,9),.5);
  b.volume=.4;assert.equal(audioGain(clips,b,9),.2);b.muted=true;assert.equal(audioGain(clips,b,9),0);
  const project={clips,tracks,assets:[{id:'a',audio:true},{id:'b',audio:true}]};
  assert.equal(audioSegments(project,[0,20]).length,1);b.muted=false;
  const segments=audioSegments(project,[9,10]);assert.equal(segments.length,2);assert.equal(segments[0].fadeOut,2);assert.equal(segments[1].fadeIn,2);
});
test('off-canvas rectangles and independent image zoom survive project saving',()=>{
  const rect={x:-.2,y:.1,w:1.4,h:1.2},c=clip('a',0,{rect,imageTransform:{zoom:2,x:.25,y:0}});
  assert.deepEqual(normalizedRect(rect),rect);
  const p={version:2,clips:[c],tracks,assets:[{id:'a',duration:10}]};
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).clips[0].rect,rect);
  const placement=imagePlacement(c,{x:0,y:0,w:200,h:100},200,100);
  assert.deepEqual(placement,{x:-50,y:-50,w:400,h:200});
  assert.equal(splitClip({...c,audioFadeIn:1,audioFadeOut:2},5,'b')[1].audioFadeIn,0);
});
test('disabled video does not prevent optional flight acceleration and has no audio',()=>{
  const c=clip('a',0,{enabled:false}),flight=clip('f',0,{kind:'flight',trackId:'map'});
  const p={clips:[c,flight],tracks,assets:[{id:'a',audio:true}],gaps:{enabled:true,speed:50}};
  assert.equal(playbackIntervals(p)[0].rate,50);assert.equal(audioSegments(p,[0,10]).length,0);
});
test('main flight display name takes precedence over embedded pilot metadata without changing source name',()=>{
  const flight=demoFlight();flight.pilot='Synthetic pilot';flight.displayName='Pilot A';flight.showNameTag=true;
  const saved=JSON.parse(JSON.stringify(flight));assert.equal(flightReadouts(saved,[],saved.start)[0].name,'Pilot A');
  assert.equal(saved.showNameTag,true);assert.equal(saved.name,flight.name);
});
