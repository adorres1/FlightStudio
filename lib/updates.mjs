import fs from 'node:fs/promises';
import path from 'node:path';
export const releasesURL = 'https://github.com/adorres1/FlightStudio/releases';
export const latestAPI = 'https://api.github.com/repos/adorres1/FlightStudio/releases/latest';
const stable = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function compareVersions(a, b) {
  const parts = v => { const m = stable.exec(v); if (!m) throw new Error('Invalid version'); return m.slice(1).map(BigInt); };
  const x=parts(a), y=parts(b);
  for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]>y[i]?1:-1;
  return 0;
}
export function releaseInfo(release, currentVersion) {
  if (!release || release.draft || release.prerelease || !stable.test(release.tag_name)) throw new Error('Invalid stable release');
  const version=release.tag_name.replace(/^v/,'');
  const name=`FlightStudio-V2-Setup-${version}.exe`;
  const url=`${releasesURL}/download/${release.tag_name}/${name}`;
  const asset=release.assets?.find(a=>a.name===name && a.state==='uploaded' && Number.isSafeInteger(a.size) && a.size>0 && a.size<1024**3 &&
    /^sha256:[a-f0-9]{64}$/.test(a.digest) && a.browser_download_url===url);
  if (!asset) throw new Error('No verified Windows installer');
  return {version, url:`${releasesURL}/tag/${release.tag_name}`, asset:{url,name,size:asset.size,sha256:asset.digest.slice(7)},
    status:compareVersions(version,currentVersion)>0?'available':compareVersions(version,currentVersion)<0?'ahead':'current'};
}
export class UpdateService {
  constructor(directory, version, fetchImpl=fetch, now=Date.now) {
    this.file=path.join(directory,'updates.json'); this.version=version; this.fetch=fetchImpl; this.now=now;
    this.preferences={automatic:true}; this.lastCheck=0; this.result=null; this.pending=null; this.saves=Promise.resolve();
  }
  async init() {
    try {
      const saved=JSON.parse(await fs.readFile(this.file,'utf8'));
      this.preferences.automatic=saved.automatic!==false;
      if(Number.isFinite(saved.lastCheck))this.lastCheck=saved.lastCheck;
      if(saved.release)this.result=releaseInfo(saved.release,this.version),this.release=saved.release;
    }catch{this.lastCheck=0;}
  }
  state() {
    const {asset,...result}=this.result||{status:'unchecked'};
    return {currentVersion:this.version,automatic:this.preferences.automatic,lastCheck:this.lastCheck,...result};
  }
  async save() {
    const value=JSON.stringify({...this.preferences,lastCheck:this.lastCheck,release:this.release});
    this.saves=this.saves.catch(()=>{}).then(()=>fs.writeFile(this.file,value));
    await this.saves;
  }
  async setAutomatic(value) {
    if(typeof value!=='boolean')throw new Error('Invalid preference');
    this.preferences.automatic=value;await this.save();return this.state();
  }
  async check(manual=false) {
    if(this.pending)return this.pending;
    if(!manual&&!this.preferences.automatic)return this.state();
    const elapsed=this.now()-this.lastCheck, ttl=manual?30000:(this.result?.status==='error'?3600000:86400000);
    if(this.lastCheck && elapsed>=0 && elapsed<ttl && this.result)return this.state();
    this.pending=(async()=>{
      try {
        const response=await this.fetch(latestAPI,{headers:{Accept:'application/vnd.github+json','User-Agent':'FlightStudio-update-check'},
          signal:AbortSignal.timeout(12000),redirect:'error'});
        if(!response.ok)throw new Error(response.status===403||response.status===429?'rate-limit':'network');
        const raw=await response.text();
        if(raw.length>2_000_000)throw new Error('invalid');
        const release=JSON.parse(raw);
        this.result=releaseInfo(release,this.version);this.release=release;
      }catch(e){this.result={status:'error',reason:e.message==='rate-limit'?'rate-limit':'network'};this.release=null;}
      this.lastCheck=this.now();await this.save();return this.state();
    })().finally(()=>this.pending=null);
    return this.pending;
  }
  async installer() {
    await this.check(true);
    if(this.result?.status!=='available')throw new Error('Kein geprüftes Update verfügbar.');
    return {...this.result.asset,version:this.result.version};
  }
}
