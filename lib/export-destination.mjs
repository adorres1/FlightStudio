import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';

export function exportFilename(name, format) {
  let base=String(name || 'FlightStudio-Film').replace(/\.(mp4|webm)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().replace(/[. ]+$/,'').slice(0,120);
  if(!base || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(base))base='FlightStudio-Film';
  return base+'.'+format;
}
async function fingerprint(file) {
  try {const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink())throw new Error('Bitte eine reguläre Videodatei auswählen.');return `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
// Called only with a path returned by the native save dialog, never from HTTP/renderer JSON.
export async function prepareDestination(file, format, internalDirectory) {
  if(!path.isAbsolute(file)||!['mp4','webm'].includes(format)||path.extname(file).toLowerCase()!=='.'+format)
    throw new Error('Bitte eine Datei mit der gewählten Video-Endung auswählen.');
  const directory=await fs.realpath(path.dirname(file));
  const internal=await fs.realpath(internalDirectory);
  const relative=path.relative(internal,directory);
  if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))
    throw new Error('Bitte einen Speicherort ausserhalb der internen Programmdaten wählen.');
  const destination=path.join(directory,path.basename(file)), expected=await fingerprint(destination);
  const temporary=path.join(directory,'.flightstudio-'+randomUUID()+'.tmp');
  const probe=await fs.open(temporary,'wx');await probe.close();await fs.unlink(temporary);
  return {path:destination,temporary,expected};
}
export async function saveDestination(source, target) {
  try {
    await fs.copyFile(source,target.temporary,constants.COPYFILE_EXCL);
    if(await fingerprint(target.path)!==target.expected)throw new Error('Die Zieldatei wurde inzwischen geändert. Bitte einen neuen Speicherort wählen.');
    // Same-directory rename keeps the existing file intact until the complete film is ready.
    if(target.expected===null){
      // Exclusive creation also protects a new file that appeared after the check.
      try {await fs.link(target.temporary,target.path);}
      catch(e){if(e.code==='EEXIST')throw e;await fs.copyFile(target.temporary,target.path,constants.COPYFILE_EXCL);}
    } else await fs.rename(target.temporary,target.path);
  } finally { await fs.rm(target.temporary,{force:true}).catch(()=>{}); }
}
