const mix=(a,b,t)=>a+(b-a)*t;
const angle=(a,b,t,period=2*Math.PI)=>a+((((b-a)+period*1.5)%period)-period/2)*t;
export function interpolateCamera(a,b,fraction){
  const t=Math.min(1,Math.max(0,fraction)),f=t*t*(3-2*t);
  return {lon:angle(a.lon,b.lon,f,360),lat:mix(a.lat,b.lat,f),height:mix(a.height,b.height,f),heading:angle(a.heading,b.heading,f),pitch:mix(a.pitch,b.pitch,f),roll:angle(a.roll||0,b.roll||0,f)};
}
export function cameraAt(time,frames,initial){
  let pose=initial;
  for(const frame of frames){
    if(time<frame.time)break;
    if(frame.duration>0&&time<frame.time+frame.duration*1000)return interpolateCamera(pose,frame.pose,(time-frame.time)/(frame.duration*1000));
    pose=frame.pose;
  }
  return pose;
}
export function validateCameraFrame(frame,frames,flight){
  if(!Number.isFinite(frame.time)||!Number.isFinite(frame.duration)||frame.duration<0)throw new Error('Ungültige Kamerazeit.');
  if(frame.time<flight.start||frame.time+frame.duration*1000>flight.end)throw new Error('Die Kamerafahrt muss vollständig innerhalb des Flugs liegen.');
  if(frames.some(f=>Math.abs(f.time-frame.time)<1||(frame.time<f.time+f.duration*1000&&frame.time+frame.duration*1000>f.time)))throw new Error('An dieser Stelle liegt bereits ein Kamerapunkt oder Übergang. Bitte eine andere Zeit wählen oder den alten Punkt entfernen.');
}
