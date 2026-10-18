import {DateTime} from 'luxon';
export function parseCaptureTime(raw,zone='Europe/Zurich',offsetSeconds=0,ignoreOffset=false) {
  if(!raw||typeof raw!=='string'||!Number.isFinite(offsetSeconds))return null;
  let value=raw.trim().replace(/^(\d{4}):(\d{2}):(\d{2})[ T]/,'$1-$2-$3T').replace(/^(\d{4}-\d{2}-\d{2}) /,'$1T');
  if(ignoreOffset)value=value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/,'');
  const dt=DateTime.fromISO(value,{zone,setZone:true});
  if(!dt.isValid||dt.year<1980||dt.year>2100)return null;
  return dt.toMillis()+offsetSeconds*1000;
}
export function chooseCaptureTag(tags={}) {
  for(const key of ['com.apple.quicktime.creationdate','creation_time','date','DATE']){
    const value=tags[key];if(typeof value==='string'&&parseCaptureTime(value,'UTC')!==null)return {raw:value,source:key,explicitZone:/(Z|[+-]\d{2}:?\d{2})$/.test(value)};
  }return null;
}
