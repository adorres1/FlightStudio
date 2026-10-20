import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIGC, finalizeFlight, sampleFlight } from '../lib/flight.mjs';
import { availableFields, createInstrument, instrumentReading, instrumentClock, bearing, validateInstruments } from '../lib/instruments.mjs';
import { editRange, validateProject } from '../lib/timeline.mjs';
const start = Date.UTC(2024, 5, 1, 10);
const flight = () => finalizeFlight(Array.from({length:21}, (_,i) => ({time:start+i*1000,lat:46,lon:7+i*.0001,alt:1200-i*2,pressure:1000+i})), 'Synthetic');
const project = () => ({version:2,assets:[],flight:flight(),flightOverlays:[],tracks:[{id:'f',visible:false}],clips:[{id:'flight',kind:'flight',trackId:'f',start:0,in:0,out:20,rate:1}]});
const b = (time, extra = '') => `B${time}4600000N00700000EA0100001200${extra}`;
test('IGC preserves fix extensions, K sensor readings, headers and satellite records with decimal time', () => {
  const f=parseIGC(['AXXXTEST','HFDTE010624','HFGTYGLIDERTYPE:Test wing','I033637TDS3839SIU4042ABC','J020811VAR1214XYZ',b('100000','2508abc'),'K1000010019xyz','F100001010203',b('100002','7509def')].join('\n'));
  assert.equal(f.start,start+250);assert.equal(f.end,start+2750);
  assert.equal(f.points[0].extensions.ABC,'abc');assert.equal(f.telemetry[0].fields.VAR,'0019');
  assert.equal(f.headers.FGTY,'Test wing');assert.equal(f.satelliteRecords[0].ids.length,3);
  const s=project();s.flight=f;
  const reading=instrumentReading(s,createInstrument('ext:VAR'),1);
  assert.equal(reading.value,'+1.9');assert.equal(reading.unit,'m/s');
  assert.equal(instrumentReading(s,createInstrument('ext:XYZ'),1).value,'xyz');
  assert.ok(availableFields(f).some(v=>v.id==='meta:FGTY'));
});
test('IGC decimal coordinates and K/F midnight rollover retain their actual timing', () => {
  const f=parseIGC(['HFDTE010624','I023636LAD3737LOD','J010810FXA',b('235959','59'),'K000000012','F0000000102',b('000001','59')].join('\n'));
  assert.ok(Math.abs(f.points[0].lat-(46+.0005/60))<1e-9);
  assert.ok(Math.abs(f.points[0].lon-(7+.0009/60))<1e-9);
  assert.equal(f.telemetry[0].time,Date.UTC(2024,5,2));assert.equal(f.satelliteRecords[0].time,Date.UTC(2024,5,2));
});
test('instrument clocks follow cuts, clip speed and hidden map tracks without changing real-world readings', () => {
  const s=project(), widget=createInstrument('vario');
  assert.equal(instrumentReading(s,widget,5).value,'-2.0');
  s.clips=editRange(s.clips,0,4,null);
  assert.equal(instrumentClock(s,1),start+5000);
  s.clips[0].rate=10;
  assert.equal(instrumentClock(s,1),start+14000);
  assert.equal(instrumentReading(s,widget,1).value,'-2.0');
  assert.equal(instrumentReading(s,createInstrument('pressure'),1).value,'1014');
  assert.equal(instrumentReading(s,createInstrument('baroVario'),1).value,'+1.0');
});
test('instruments select each flight with UTC or aligned start and signed offset', () => {
  const s=project(), other=flight();
  for(const p of other.points){p.time+=60000;p.alt+=500;}other.start+=60000;other.end+=60000;
  s.flightOverlays=[{id:'second',flight:other,alignment:'start',offsetSeconds:2,color:'#00ffff',visible:false,name:'Camera B'}];
  const item=createInstrument('altitude','second');
  assert.equal(instrumentReading(s,item,5).number,1694);
  s.flightOverlays[0].alignment='absolute';
  assert.equal(instrumentReading(s,item,5).value,'—');
});
test('compass bearings wrap at north; stationary data, climbing glide ratios and logger gaps stay blank', () => {
  assert.equal(bearing({lat:0,lon:0},{lat:1,lon:0}),0);
  assert.ok(bearing({lat:0,lon:179.999},{lat:0,lon:-179.999})>89);
  assert.equal(bearing({lat:0,lon:0},{lat:0,lon:0}),null);
  const s=project();assert.equal(instrumentReading(s,createInstrument('heading'),0).value,'—');
  assert.ok(instrumentReading(s,createInstrument('glide'),5).number>0);
  s.flight=finalizeFlight([{time:start,lat:46,lon:7,alt:1000},{time:start+200000,lat:46.1,lon:7.1,alt:1500}], 'Gap');
  s.clips[0].out=201;
  assert.equal(instrumentReading(s,createInstrument('vario'),100).value,'—');
  assert.equal(instrumentReading(s,createInstrument('vario'),200).value,'—');
});
test('pressure interpolates and unknown units remain raw; absent or stale sensors never become zero', () => {
  const s=project();
  assert.equal(sampleFlight(s.flight,start+1500).pressure,1001.5);
  assert.equal(instrumentReading(s,createInstrument('ext:TAS'),5).value,'—');
  s.flight.telemetry=[{time:start,fields:{TAS:'0072'}}];s.flight.extensionCodes=['TAS'];
  const read=instrumentReading(s,createInstrument('ext:TAS'),5);
  assert.equal(read.value,'0072');assert.equal(read.unit,'');assert.equal(read.number,null);
  s.flight.telemetry[0].time=start-121000;
  assert.equal(instrumentReading(s,createInstrument('ext:TAS'),5).value,'—');
});
test('instruments survive project saving and reject corrupt controls without adding anything to old projects', () => {
  const s=project(), item=createInstrument('heading'); item.rect={x:-.2,y:.5,w:.4,h:.3};
  s.instruments=[item];assert.deepEqual(validateProject(JSON.parse(JSON.stringify(s))).instruments,[item]);
  assert.throws(()=>validateInstruments([{...item,opacity:Infinity}]));
  assert.throws(()=>validateInstruments([item,item]));
  const old=project();validateProject(old);assert.equal(old.instruments,undefined);
});
