const mix=(a,b,t)=>a+(b-a)*t;
const angle=(a,b,t,period=2*Math.PI)=>a+((((b-a)+period*1.5)%period)-period/2)*t;
export const TOP_VIEW=Object.freeze({heading:0,pitch:-Math.PI/2,range:4000});
export function interpolateCamera(a,b,fraction){
  const t=Math.min(1,Math.max(0,fraction)),f=t*t*(3-2*t);
  return {lon:angle(a.lon,b.lon,f,360),lat:mix(a.lat,b.lat,f),height:mix(a.height,b.height,f),heading:angle(a.heading,b.heading,f),pitch:mix(a.pitch,b.pitch,f),roll:angle(a.roll||0,b.roll||0,f)};
}
// Frame timestamps are arrival times. Durations are seconds of the finished film.
// Shorten an incoming transition when the start or previous keyframe is closer.
export function cameraWindow(frame,frames,start=0){
  const previous=Math.max(start,...frames.filter(f=>f.time<frame.time).map(f=>f.time));
  return {start:Math.max(previous,frame.time-frame.duration*1000),end:frame.time};
}
export function cameraAt(time,frames,initial){
  let pose=initial,previous=0;
  for(const frame of frames){
    const start=Math.max(previous,frame.time-frame.duration*1000);
    if(time<start)return pose;
    if(time<frame.time)return interpolateCamera(pose,frame.pose,(time-start)/(frame.time-start));
    pose=frame.pose;previous=frame.time;
  }
  return pose;
}
export function validateCameraFrame(frame,frames,range){
  if(!Number.isFinite(frame.time)||!Number.isFinite(frame.duration)||frame.duration<0||frame.duration>3600)throw new Error('Ungültige Kamerazeit.');
  if(frame.time<range.start||frame.time>range.end)throw new Error('Der Kamerapunkt muss innerhalb des Films liegen.');
  if(frames.some(f=>Math.abs(f.time-frame.time)<1))throw new Error('An dieser Stelle liegt bereits ein Kamerapunkt.');
}
export function putCameraFrame(frames,frame){
  return [...frames.filter(f=>Math.abs(f.time-frame.time)>=1),{...frame,duration:frame.time===0?0:frame.duration}].sort((a,b)=>a.time-b.time);
}
// Preserve the timing of older projects, which stored departure times instead.
export function migrateCameraTiming(map,toOutput,fromOutput){
  if(map.timing==='arrival')return map;
  return {...map,timing:'arrival',frames:(map.frames||[]).map(f=>({...f,time:fromOutput(toOutput(f.time)+f.duration*1000)})).sort((a,b)=>a.time-b.time)};
}
