import {
  end,
  sourceTime,
  playbackIntervals,
  outputDuration,
} from "./timeline.mjs";
import { audioFades } from './clip-effects.mjs';
export function audioSegments(project, range) {
  const intervals = playbackIntervals(project),
    assets = new Map(project.assets.map((a) => [a.id, a])),
    tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const result = [];
  for (const c of project.clips) {
    const asset = assets.get(c.assetId),
      track = tracks.get(c.trackId);
    if (
      !["video", "audio"].includes(c.kind) ||
      !asset?.audio ||
      !track ||
      track.muted ||
      c.volume === 0 || c.muted || c.enabled === false
    )
      continue;
    for (const span of intervals) {
      const from = Math.max(range[0], c.start, span.start),
        to = Math.min(range[1], end(c), span.end),
        rate = c.rate * span.rate;
      if (to <= from || rate > 4) continue;
      result.push({
        assetId: asset.id,
        sourceStart: sourceTime(c, from),
        sourceEnd: sourceTime(c, to),
        rate,
        at: outputDuration(intervals, range[0], from),
        duration: (to - from) / span.rate,
        volume: c.volume ?? 1,
        ...audioFades(project.clips, c),
        clipPosition: from - c.start,
        clipRemaining: end(c) - from,
        timelineRate: span.rate,
      });
    }
  }
  return result;
}
export function atempo(rate) {
  const parts = [];
  while (rate < 0.5) {
    parts.push("atempo=0.5");
    rate /= 0.5;
  }
  while (rate > 2) {
    parts.push("atempo=2");
    rate /= 2;
  }
  parts.push("atempo=" + rate.toFixed(8));
  return parts.join(",");
}
export function audioFilter(segments, assetIds, duration) {
  const filters = [];
  for (const [input, id] of assetIds.entries()) {
    const indexes = segments.flatMap((s, i) => (s.assetId === id ? [i] : []));
    filters.push(
      `[${input + 1}:a]asplit=${indexes.length}${indexes.map((i) => "[a" + i + "]").join("")}`,
    );
  }
  for (const [i, s] of segments.entries()) {
    const fadeIn = s.fadeIn ? `(${s.clipPosition}+t*${s.timelineRate})/${s.fadeIn}` : '1';
    const fadeOut = s.fadeOut ? `(${s.clipRemaining}-t*${s.timelineRate})/${s.fadeOut}` : '1';
    const gain = `${s.volume}*max(0,min(1,min(${fadeIn},${fadeOut})))`;
    filters.push(
      `[a${i}]atrim=start=${s.sourceStart}:end=${s.sourceEnd},asetpts=PTS-STARTPTS,${atempo(s.rate)},volume='${gain}':eval=frame,adelay=${Math.round(s.at * 1000)}:all=1[s${i}]`,
    );
  }
  filters.push(
    segments.map((_, i) => `[s${i}]`).join("") +
      `amix=inputs=${segments.length}:normalize=0:duration=longest,alimiter=level=false:latency=true,apad,atrim=duration=${duration}[mix]`,
  );
  return filters.join(";\n");
}
