import { extensionSchema, readExtensions, decimalSeconds, coordinateDecimals } from './igc-fields.mjs';
const DAY = 86400000;
export function haversine(a, b) {
  const rad=Math.PI/180, dl=(b.lat-a.lat)*rad, dn=(b.lon-a.lon)*rad;
  const h=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function finalizeFlight(points,name,extra={}) {
  if(points.length<2) throw new Error('Die Datei enthält weniger als zwei gültige GPS-Punkte mit Zeitstempel.');
  let distance=0,gaps=0,minAlt=Infinity,maxAlt=-Infinity;
  for(let i=0;i<points.length;i++) {
    const p=points[i],prev=points[i-1];
    if(![p.time,p.lat,p.lon,p.alt].every(Number.isFinite)||Math.abs(p.lat)>90||Math.abs(p.lon)>180) throw new Error('Ungültige Koordinaten oder Zeitstempel in der Flugdatei.');
    if(prev&&p.time<=prev.time) throw new Error('Die Flugzeiten müssen aufsteigend sein.');
    const dt=prev?(p.time-prev.time)/1000:0;
    p.gap=dt>120;if(p.gap)gaps++;
    const d=prev&&!p.gap?haversine(prev,p):0;
    distance+=d;p.distance=distance;p.speed=dt&&!p.gap?d/dt*3.6:0;p.vario=dt&&!p.gap?(p.alt-prev.alt)/dt:0;
    minAlt=Math.min(minAlt,p.alt);maxAlt=Math.max(maxAlt,p.alt);
  }
  return {name,...extra,points,start:points[0].time,end:points.at(-1).time,distance,minAlt,maxAlt,gaps};
}
export function parseIGC(text,name='Flug.igc') {
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/),date=lines.map(l=>l.match(/^H[FP]DTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/)).find(Boolean);
  if(!date)throw new Error('IGC-Datum fehlt (HFDTE). Bitte die Originaldatei vom Skytraxx verwenden.');
  const [,dd,mm,yy]=date,year=+yy>=80?1900+(+yy):2000+(+yy);
  let midnight=Date.UTC(year,+mm-1,+dd),previousSeconds=-1,skipped=0;
  const day=new Date(midnight);
  if(day.getUTCFullYear()!==year||day.getUTCMonth()!==+mm-1||day.getUTCDate()!==+dd)throw new Error('Ungültiges IGC-Datum.');
  const points=[],telemetry=[],satelliteRecords=[],headers={},extensionCodes=new Set();let pilot='',glider='',schema=[],extraSchema=[];
  const eventTime = line => { const h=+line.slice(1,3),m=+line.slice(3,5),s=+line.slice(5,7); if(!/^.[0-9]{6}/.test(line)||h>23||m>59||s>59)return null; const seconds=h*3600+m*60+s; return midnight+seconds*1000+(previousSeconds>=0&&seconds<previousSeconds-43200?DAY:seconds>previousSeconds+43200&&midnight>day.getTime()?-DAY:0); };
  for(const line of lines) {
    if(/^H[FP]PLT/.test(line))pilot=line.split(':').slice(1).join(':').trim();
    if(/^H[FP]GTY/.test(line))glider=line.split(':').slice(1).join(':').trim();
    if(/^H[FOP][A-Z0-9]{3}/.test(line)){const key=line.slice(1,5),value=line.includes(':')?line.slice(line.indexOf(':')+1).trim():line.slice(5).trim();if(value)headers[key]=headers[key]?headers[key]+' · '+value:value;}
    if(line.startsWith('A'))headers.Recorder=line.slice(1).trim();
    if(line.startsWith('I')){schema=extensionSchema(line);schema.forEach(f=>extensionCodes.add(f.code));}
    if(line.startsWith('J')){extraSchema=extensionSchema(line);extraSchema.forEach(f=>extensionCodes.add(f.code));}
    if(line.startsWith('K')){const time=eventTime(line),fields=readExtensions(line,extraSchema);if(time!==null)telemetry.push({time:time+decimalSeconds(fields)*1000,fields});}
    if(line.startsWith('F')){const time=eventTime(line),ids=line.slice(7).trim().match(/[A-Z0-9]{2}/g)||[];if(time!==null)satelliteRecords.push({time,ids});}
    if(!line.startsWith('B'))continue;
    if(!/^B\d{13}[NS]\d{8}[EW][AV][\d-]{10}/.test(line)||line[24]!=='A'){skipped++;continue;}
    const h=+line.slice(1,3),min=+line.slice(3,5),sec=+line.slice(5,7),latMin=+line.slice(9,14),lonMin=+line.slice(18,23);
    if(h>23||min>59||sec>59||latMin>=60000||lonMin>=60000){skipped++;continue;}
    const extensions=readExtensions(line,schema),seconds=h*3600+min*60+sec+decimalSeconds(extensions);
    if(previousSeconds>=0&&seconds<previousSeconds-43200)midnight+=DAY;
    const time=midnight+seconds*1000;
    if(points.length&&time<=points.at(-1).time){skipped++;continue;}
    const lat=(+line.slice(7,9)+latMin/60000+coordinateDecimals(extensions.LAD))*(line[14]==='S'?-1:1),lon=(+line.slice(15,18)+lonMin/60000+coordinateDecimals(extensions.LOD))*(line[23]==='W'?-1:1);
    const gps=Number(line.slice(30,35)),pressure=Number(line.slice(25,30));
    if(Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(gps)){skipped++;continue;}
    points.push({time,lat,lon,alt:gps,pressure,extensions});previousSeconds=seconds;
  }
  return finalizeFlight(points,name,{pilot,glider,skipped,format:'IGC',headers,extensionCodes:[...extensionCodes],telemetry:telemetry.sort((a,b)=>a.time-b.time),satelliteRecords:satelliteRecords.sort((a,b)=>a.time-b.time)});
}
export function sampleFlight(flight,time) {
  if(!flight||time<flight.start||time>flight.end)return null;
  const a=flight.points;let low=0,high=a.length-1;
  while(low<high){const mid=Math.ceil((low+high)/2);if(a[mid].time<=time)low=mid;else high=mid-1;}
  const p=a[low],q=a[low+1];if(!q||p.time===time)return {...p,index:low};if(q.gap)return null;
  const f=(time-p.time)/(q.time-p.time),lerp=(x,y)=>x+(y-x)*f;
  let dlon=q.lon-p.lon;if(dlon>180)dlon-=360;if(dlon< -180)dlon+=360;
  return {...p,time,lat:lerp(p.lat,q.lat),lon:((p.lon+dlon*f+540)%360)-180,alt:lerp(p.alt,q.alt),pressure:Number.isFinite(p.pressure)&&Number.isFinite(q.pressure)?lerp(p.pressure,q.pressure):null,distance:lerp(p.distance,q.distance),speed:q.speed,vario:q.vario,index:low};
}
export const escapeXML=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function toKML(flight) {
  const tracks=[];let segment=[];
  for(const p of flight.points){if(p.gap&&segment.length){tracks.push(segment);segment=[];}segment.push(p);}if(segment.length)tracks.push(segment);
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${escapeXML(flight.name)}</name><Style id="flight"><LineStyle><color>ff48dfc9</color><width>4</width></LineStyle></Style><Placemark><name>${escapeXML(flight.name)}</name><styleUrl>#flight</styleUrl><gx:MultiTrack>${tracks.map(ps=>`<gx:Track><altitudeMode>absolute</altitudeMode>${ps.map(p=>`<when>${new Date(p.time).toISOString()}</when>`).join('')}${ps.map(p=>`<gx:coord>${p.lon} ${p.lat} ${p.alt}</gx:coord>`).join('')}</gx:Track>`).join('')}</gx:MultiTrack></Placemark></Document></kml>`;
}
export function demoFlight() {
  const start=Date.UTC(2024,5,1,10,10),points=[];
  for(let i=0;i<=720;i++){const t=i/720,a=t*Math.PI*5;points.push({time:start+i*2000,lat:46.680+0.018*Math.sin(a)+t*0.026,lon:7.835+0.020*Math.cos(a)+t*0.065,alt:1600+650*Math.sin(t*Math.PI)+110*Math.sin(a*3),pressure:1600});}
  return finalizeFlight(points,'Demo · Berner Oberland',{pilot:'Synthetischer Demoflug',format:'DEMO',skipped:0});
}
