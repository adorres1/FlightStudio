import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {finalizeFlight} from './flight.mjs';
export function parseKML(text,name='Flug.kml') {
  if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw new Error('Ungültige KML-Datei.');
  const tree=new XMLParser({removeNSPrefix:true,parseTagValue:false,ignoreAttributes:false}).parse(text),points=[];
  const array=v=>v===undefined?[]:Array.isArray(v)?v:[v];
  function visit(node){
    if(!node||typeof node!=='object')return;
    if(node.Track)for(const track of array(node.Track)){
      const times=array(track.when),coords=array(track.coord);
      if(times.length!==coords.length)throw new Error('KML: Anzahl Zeiten und GPS-Punkte stimmt nicht überein.');
      if(track.altitudeMode&&track.altitudeMode!=='absolute')throw new Error('KML-Höhen müssen absolut sein. Bitte die IGC-Originaldatei verwenden.');
      times.forEach((t,i)=>{const [lon,lat,alt]=String(coords[i]).trim().split(/\s+/).map(Number);points.push({time:Date.parse(t),lon,lat,alt});});
    }
    if(node.Point&&node.TimeStamp?.when){const [lon,lat,alt]=String(node.Point.coordinates).trim().split(',').map(Number);points.push({time:Date.parse(node.TimeStamp.when),lon,lat,alt});}
    for(const [key,value]of Object.entries(node))if(key!=='Track')for(const child of array(value))visit(child);
  }
  visit(tree);if(!points.length)throw new Error('Diese KML-Datei enthält keine Flugzeiten. Bitte IGC oder KML/KMZ mit gx:Track verwenden. Eine reine Linie lässt sich nicht zeitlich synchronisieren.');
  points.sort((a,b)=>a.time-b.time);
  return finalizeFlight(points.filter((p,i)=>!i||p.time!==points[i-1].time),name,{format:'KML',skipped:0});
}
