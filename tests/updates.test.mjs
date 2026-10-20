import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compareVersions,releaseInfo,UpdateService,latestAPI} from '../lib/updates.mjs';
import {UpdateInstaller,allowedDownload} from '../lib/update-installer.mjs';
const bytes=Buffer.from('Synthetic installer fixture — never executed');
const digest=createHash('sha256').update(bytes).digest('hex');
const release=()=>({tag_name:'v2.5.0',draft:false,prerelease:false,assets:[{
  name:'FlightStudio-V2-Setup-2.5.0.exe',state:'uploaded',size:bytes.length,digest:'sha256:'+digest,
  browser_download_url:'https://github.com/adorres1/FlightStudio/releases/download/v2.5.0/FlightStudio-V2-Setup-2.5.0.exe'
}]});
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flightstudio-update-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('update versions are numeric, stable and require the exact verified installer',()=>{
  assert.equal(compareVersions('v2.10.0','2.9.9'),1);
  assert.equal(compareVersions('2.5.0','v2.5.0'),0);
  assert.equal(releaseInfo(release(),'2.4.1').status,'available');
  assert.equal(releaseInfo(release(),'2.5.0').status,'current');
  assert.equal(releaseInfo(release(),'2.6.0').status,'ahead');
  for(const mutation of [
    r=>r.draft=true,r=>r.prerelease=true,r=>r.tag_name='v2.6.0-beta',r=>r.tag_name='../evil',
    r=>r.assets=[],r=>r.assets[0].digest=null,r=>r.assets[0].size=1.5,
    r=>r.assets[0].browser_download_url='https://evil.invalid/installer.exe',
    r=>r.assets[0].name='FlightStudio-V2-Portable-2.5.0.exe',
  ]){const r=release();mutation(r);assert.throws(()=>releaseInfo(r,'2.4.1'));}
});
test('update checks deduplicate, cache, persist preferences and do not report failed checks as current',async t=>{
  const dir=await directory(t);let calls=0,now=1_000_000;
  const mock=async(url,opts)=>{assert.equal(url,latestAPI);assert.equal(opts.headers.Authorization,undefined);calls++;await new Promise(r=>setTimeout(r,10));return Response.json(release());};
  const service=new UpdateService(dir,'2.4.1',mock,()=>now);await service.init();
  const results=await Promise.all([service.check(),service.check(true)]);
  assert.equal(calls,1);assert.equal(results[0].status,'available');
  assert.equal(results[0].asset,undefined);
  await service.check();assert.equal(calls,1);
  await service.setAutomatic(false);
  const reopened=new UpdateService(dir,'2.4.1',mock,()=>now+86400000);await reopened.init();
  await reopened.check();assert.equal(calls,1);assert.equal(reopened.state().automatic,false);
  await reopened.check(true);assert.equal(calls,2);
  now+=86400000;
  service.fetch=async()=>new Response('',{status:429});
  assert.equal((await service.check(true)).status,'error');
  assert.equal(service.state().reason,'rate-limit');
  await assert.rejects(()=>service.installer(),/Kein/);
});
test('installer restricts redirects, checks streamed size/hash, rechecks file and never launches during export',async t=>{
  const dir=await directory(t),asset=releaseInfo(release(),'2.4.1').asset;
  let exporting=false,opened=[],requests=0;
  const updater=new UpdateInstaller({directory:dir,updates:{installer:async()=>({...asset,version:'2.5.0'})},
    fetchImpl:async url=>{requests++;return url===asset.url?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/test'}}):
      new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,9));c.enqueue(bytes.subarray(9));c.close();}}));},
    openFile:async file=>{opened.push(file);return '';},isExporting:()=>exporting});
  await assert.rejects(()=>updater.install(),/zuerst/);
  exporting=true;await assert.rejects(()=>updater.download(),/Export/);assert.equal(requests,0);
  exporting=false;assert.equal((await updater.download()).stage,'ready');assert.equal(opened.length,0);assert.equal(requests,2);
  exporting=true;await assert.rejects(()=>updater.install(),/Export/);
  exporting=false;await fs.appendFile(updater.ready.path,'changed');
  await assert.rejects(()=>updater.install(),/verändert/);assert.equal(opened.length,0);
  await updater.download();assert.equal((await updater.install()).stage,'installing');assert.equal(opened.length,1);
  for(const url of ['http://github.com/file','https://github.com.evil.invalid/file','file:///tmp/a','https://user@github.com/file'])assert.equal(allowedDownload(url),false);
});
test('installer deletes incomplete downloads and rejects hostile redirects',async t=>{
  const dir=await directory(t),asset={...releaseInfo(release(),'2.4.1').asset,version:'2.5.0'};
  const updater=new UpdateInstaller({directory:dir,updates:{installer:async()=>asset},fetchImpl:async()=>new Response(Buffer.alloc(bytes.length)),openFile:()=>assert.fail('must not launch')});
  await assert.rejects(()=>updater.download(),/Prüfsumme/);assert.equal(updater.ready,null);
  assert.deepEqual(await fs.readdir(path.join(dir,asset.version)),[]);
  updater.fetch=async()=>new Response(null,{status:302,headers:{location:'https://evil.invalid/a'}});
  await assert.rejects(()=>updater.download(),/Downloadadresse/);
  updater.fetch=async()=>new Response(new ReadableStream({start(c){updater.cancel();c.enqueue(bytes);c.close();}}));
  await assert.rejects(()=>updater.download());assert.equal(updater.state().stage,'cancelled');
  assert.deepEqual(await fs.readdir(path.join(dir,asset.version)),[]);
});
