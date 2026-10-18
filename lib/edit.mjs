export function editMap(segments){let end=0;return segments.map(s=>{const duration=(s.end-s.start)/1000/s.rate;const item={...s,outStart:end,outEnd:end+duration};end+=duration;return item;});}
export function editDuration(segments){return segments.reduce((n,s)=>n+(s.end-s.start)/1000/s.rate,0);}
export function sourceAt(outputTime,segments){
  const map=editMap(segments);if(!map.length)return null;
  const t=Math.max(0,Math.min(outputTime,map.at(-1).outEnd)),s=map.find(x=>t<x.outEnd)||map.at(-1);
  return {time:s.start+(t-s.outStart)*1000*s.rate,rate:s.rate,segment:s};
}
export function outputAt(sourceTime,segments){
  const map=editMap(segments);const s=map.find(x=>sourceTime>=x.start&&sourceTime<x.end)||map.find(x=>sourceTime===x.end);
  return s?s.outStart+(sourceTime-s.start)/1000/s.rate:null;
}
export function changeRange(segments,from,to,rate=null){
  if(!Number.isFinite(from)||!Number.isFinite(to)||to-from<.02)throw new Error('Bitte einen Bereich mit Anfang und Ende wählen.');
  if(rate!==null&&(!Number.isFinite(rate)||rate<.1||rate>100))throw new Error('Die Geschwindigkeit muss zwischen 0.1× und 100× liegen.');
  const result=[];
  for(const s of editMap(segments)){
    const a=Math.max(from,s.outStart),b=Math.min(to,s.outEnd);
    const add=(start,end,r=s.rate)=>{if(end-start>.01)result.push({start,end,rate:r});};
    if(a>=b){add(s.start,s.end);continue;}
    const start=s.start+(a-s.outStart)*1000*s.rate,end=s.start+(b-s.outStart)*1000*s.rate;
    add(s.start,start);if(rate!==null)add(start,end,rate);add(end,s.end);
  }
  if(!result.length)throw new Error('Mindestens ein Flugabschnitt muss bleiben.');return result;
}
export function splitSegment(segments,position){
  const p=sourceAt(position,segments);if(!p)return segments;
  return segments.flatMap(s=>p.time>s.start+1&&p.time<s.end-1?[{...s,end:p.time},{...s,start:p.time}]:[{...s}]);
}
export function sourceRanges(segments,from,to){
  return editMap(segments).flatMap(s=>{const a=Math.max(from,s.outStart),b=Math.min(to,s.outEnd);return b>a?[[s.start+(a-s.outStart)*1000*s.rate,s.start+(b-s.outStart)*1000*s.rate]]:[];});
}
export function subtractRanges(start,end,cuts){
  let keep=[[start,end]];for(const [a,b]of cuts)keep=keep.flatMap(([s,e])=>b<=s||a>=e?[[s,e]]:[[s,Math.min(a,e)],[Math.max(b,s),e]].filter(([x,y])=>y-x>.02));return keep;
}
export function visibleClipRanges(start,end,segments){
  return editMap(segments).flatMap(s=>{const a=Math.max(start,s.start),b=Math.min(end,s.end);return b>a?[{start:s.outStart+(a-s.start)/1000/s.rate,end:s.outStart+(b-s.start)/1000/s.rate,sourceStart:a,sourceEnd:b,rate:s.rate}]:[];});
}
