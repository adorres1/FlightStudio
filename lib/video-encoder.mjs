import { spawn } from 'node:child_process';
import { pixelSize, qualities } from './export-settings.mjs';

export const encoderLabel = name => ({
  h264_amf: 'AMD GPU', h264_nvenc: 'NVIDIA GPU', h264_qsv: 'Intel GPU',
  libx264: 'CPU · H.264', 'libvpx-vp9': 'CPU · VP9',
}[name] || name);

export function encoderArgs(name, quality = 'standard') {
  const q = qualities[quality].crf;
  if (name === 'h264_amf') return ['-c:v',name,'-quality','balanced','-rc','cqp','-qp_i',String(q),'-qp_p',String(q),'-qp_b',String(q)];
  if (name === 'h264_nvenc') return ['-c:v',name,'-preset','p4','-rc','constqp','-qp',String(q)];
  if (name === 'h264_qsv') return ['-c:v',name,'-preset','veryfast','-global_quality',String(q)];
  if (name === 'libvpx-vp9') return ['-c:v',name,'-deadline','good','-cpu-used','4','-crf',String(qualities[quality].vp9),'-b:v','0'];
  return ['-c:v','libx264','-preset','veryfast','-crf',String(q)];
}

export class VideoEncoder {
  constructor(ffmpeg, probe) { this.ffmpeg = ffmpeg; this.cache = new Map(); this.probe = probe || (args => this.runProbe(args)); }
  runProbe(args) {
    return new Promise(resolve => {
      const child = spawn(this.ffmpeg, args, { windowsHide: true, stdio: 'ignore' });
      const timeout = setTimeout(() => { child.kill(); resolve(false); }, 8000);
      child.once('error', () => { clearTimeout(timeout); resolve(false); });
      child.once('close', code => { clearTimeout(timeout); resolve(code === 0); });
    });
  }
  async select(options, aspect = '16:9') {
    if (options.format === 'webm') return 'libvpx-vp9';
    if (options.acceleration === 'cpu') return 'libx264';
    const {width, height} = pixelSize(aspect, options.size);
    const key = `${width}:${height}:${options.fps}:${options.quality}`;
    if (!this.cache.has(key)) this.cache.set(key, (async () => {
      for (const name of ['h264_amf','h264_nvenc','h264_qsv']) {
        const ok = await this.probe(['-v','error','-f','lavfi','-i',`color=c=black:s=${width}x${height}:r=${options.fps}`,
          '-frames:v','3','-an',...encoderArgs(name,options.quality),'-pix_fmt','yuv420p','-f','null','-']);
        if (ok) return name;
      }
      return 'libx264';
    })());
    return this.cache.get(key);
  }
}
