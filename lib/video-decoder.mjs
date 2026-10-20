import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

// Sequential source frames, with original presentation times. Two JPEGs are
// retained: the current picture and one lookahead. Pipes provide backpressure.
export class VideoDecoder {
  constructor(ffmpeg,file){this.ffmpeg=ffmpeg;this.file=file;this.lastRequested=-1;this.busy=false;}
  stop(){
    this.child?.kill();this.lines?.close();this.child=null;
    this.frames=null;this.current=null;this.next=null;
  }
  start(time){
    this.stop();
    this.seek=Math.max(0,time-1);
    const run={seek:this.seek,error:'',timestamps:[],waiters:[],ended:false,timeBase:0};
    this.timestamps=run.timestamps;
    const child=spawn(this.ffmpeg,[
      '-hide_banner','-loglevel','info','-ss',String(this.seek),'-i',this.file,
      '-map','0:v:0','-an','-sn','-dn','-vf','scale=out_color_matrix=bt601:out_range=full,format=yuvj420p,showinfo',
      '-fps_mode','passthrough','-c:v','mjpeg','-q:v','2','-threads','1','-f','image2pipe','pipe:1',
    ],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    this.child=child;
    this.lines=createInterface({input:child.stderr});
    this.lines.on('line',line=>{
      const base=/config in time_base:\s*(\d+)\/(\d+)/.exec(line);
      if(base)run.timeBase=Number(base[1])/Number(base[2]);
      const pts=/\bn:\s*\d+\s+pts:\s*([-\d]+)\s+pts_time:([-\d.e+]+)/.exec(line);
      if(pts){
        const timestamp=(run.timeBase?Number(pts[1])*run.timeBase:Number(pts[2]))+run.seek;
        if(run.waiters.length)run.waiters.shift()(timestamp);
        else run.timestamps.push(timestamp);
        if(run.timestamps.length>2048){run.error='Video decoder exceeded its read-ahead limit';child.kill();}
      }else run.error=(run.error+'\n'+line).slice(-2000);
    });
    this.lines.on('close',()=>{run.ended=true;for(const resolve of run.waiters.splice(0))resolve(null);});
    run.closed=new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('close',code=>code===0?resolve():reject(new Error('Video decoder: '+run.error)));
    });
    run.closed.catch(()=>{});
    this.frames=this.readFrames(child.stdout,run);
  }
  async timestamp(run){
    if(run.timestamps.length)return run.timestamps.shift();
    if(run.ended)return null;
    return new Promise(resolve=>run.waiters.push(resolve));
  }
  async *readFrames(stream,run){
    let buffer=Buffer.alloc(0);
    for await(const chunk of stream){
      buffer=Buffer.concat([buffer,chunk]);
      if(buffer.length>64*1024**2)throw new Error('Video frame exceeds the decoder buffer limit');
      let end;
      while((end=buffer.indexOf(Buffer.from([255,217])))>=0){
        const data=buffer.subarray(0,end+2);buffer=buffer.subarray(end+2);
        if(data[0]!==255||data[1]!==216)throw new Error('Invalid decoded video frame');
        const time=await this.timestamp(run);
        if(time===null||!Number.isFinite(time))throw new Error('Missing video frame timestamp');
        yield {time,data};
      }
    }
    await run.closed;
    if(buffer.length)throw new Error('Incomplete decoded video frame');
  }
  async frame(time){
    if(!Number.isFinite(time)||time<0)throw new Error('Invalid video time');
    if(this.busy)throw new Error('Video frame is already being decoded');
    this.busy=true;
    const timeout=setTimeout(()=>this.child?.kill(),30000);
    try{
      if(!this.frames||time<this.lastRequested-1e-6||time-this.lastRequested>2)this.start(time);
      this.lastRequested=time;
      while(true){
        if(!this.next){const item=await this.frames.next();if(item.done)break;this.next=item.value;}
        if(this.current&&this.next.time>time+1e-6)break;
        this.current=this.next;this.next=null;
      }
      if(!this.current)throw new Error('No video frame could be decoded');
      return this.current.data;
    }finally{clearTimeout(timeout);this.busy=false;}
  }
}
