import { active, clamp, end, length, fade, layoutRects, sceneLayout } from './timeline.mjs';

const visual = c => ['video', 'photo'].includes(c.kind);
const compatible = (a, b) => (visual(a) && visual(b)) || (a.kind === 'audio' && b.kind === 'audio');

// Transitions use real overlapping source intervals. No frozen frames, hidden
// source extensions or changes to other tracks are needed.
export function transitionFor(clips, incoming) {
  const link = incoming?.transitionIn;
  if (!link || !['dissolve', 'wipe'].includes(link.type) || incoming.enabled === false) return null;
  const previous = clips.find(c => c.id === link.fromId);
  if (!previous || previous.enabled === false || previous.trackId !== incoming.trackId ||
      !compatible(previous, incoming) || previous.start >= incoming.start || end(previous) >= end(incoming)) return null;
  const duration = end(previous) - incoming.start;
  if (duration < .02 || clips.some(c => c.id !== previous.id && c.id !== incoming.id && c.enabled !== false &&
      c.trackId === incoming.trackId && c.start < end(previous) && end(c) > incoming.start)) return null;
  return { previous, incoming, type: link.type, start: incoming.start, end: end(previous), duration };
}

export function previousClip(clips, incoming) {
  return clips.filter(c => c.id !== incoming.id && c.enabled !== false && c.trackId === incoming.trackId &&
    c.start < incoming.start && compatible(c, incoming)).sort((a, b) => b.start - a.start)[0];
}

export function applyTransition(clips, incoming, type, duration) {
  if (!['dissolve', 'wipe'].includes(type)) return { ...incoming, transitionIn: null };
  const previous = previousClip(clips, incoming);
  if (!previous) throw new Error('Kein passender vorheriger Clip auf dieser Spur.');
  if (!Number.isFinite(duration) || duration < .05) throw new Error('Die Übergangsdauer muss mindestens 0.05 s betragen.');
  const amount = Math.min(duration, length(previous) - .05, length(incoming) - .05);
  if (amount < .05) throw new Error('Die Clips sind für diesen Übergang zu kurz.');
  const next = { ...incoming, start: end(previous) - amount, auto: false, transitionIn: { fromId: previous.id, type } };
  if (!transitionFor(clips.map(c => c.id === next.id ? next : c), next))
    throw new Error('Der Übergang würde einen dritten Clip überlappen.');
  return next;
}

export function connectOverlap(clips, incoming) {
  if (incoming.transitionIn || incoming.enabled === false) return incoming;
  const previous = previousClip(clips, incoming);
  if (!previous) return incoming;
  const next = { ...incoming, transitionIn: { fromId: previous.id, type: 'dissolve' } };
  return transitionFor(clips.map(c => c.id === next.id ? next : c), next) ? next : incoming;
}

export function transitionProgress(transition, time) {
  return clamp((time - transition.start) / transition.duration, 0, 1);
}

export function effectScene(clips, tracks, time, preset) {
  const order = new Map(tracks.map((t, i) => [t.id, { ...t, index: i }])), highest = new Map();
  for (const c of clips) {
    if (!active(c, time) || !order.get(c.trackId)?.visible || c.kind === 'audio') continue;
    if (!highest.has(c.trackId) || highest.get(c.trackId).start <= c.start) highest.set(c.trackId, c);
  }
  preset = sceneLayout([...highest.values()], preset);
  const z = c => order.get(c.trackId).index + (c.kind === 'flight' ? (preset === 'map-main' ? -1000 : 1000) : c.kind === 'title' ? 2000 : 0);
  const top = [...highest.values()].sort((a, b) => z(a) - z(b)), rects = layoutRects(top, preset), transitions = new Map();
  const layers = top.flatMap(c => {
    const transition = transitionFor(clips, c);
    if (!transition || time >= transition.end) return [c];
    transitions.set(c.id, transition);
    rects.set(transition.previous.id, transition.previous.rect || rects.get(c.id));
    return [transition.previous, c];
  });
  return { layers, rects, transitions };
}

export function audioFades(clips, clip) {
  const incoming = transitionFor(clips, clip);
  const outgoing = clips.map(c => transitionFor(clips, c)).find(t => t?.previous.id === clip.id);
  return {
    fadeIn: Math.max(clip.audioFadeIn ?? clip.fadeIn ?? 0, incoming?.duration || 0),
    fadeOut: Math.max(clip.audioFadeOut ?? clip.fadeOut ?? 0, outgoing?.duration || 0),
  };
}

export function audioGain(clips, clip, time) {
  return clip.enabled === false || clip.muted ? 0 : (clip.volume ?? 1) * fade({ ...clip, ...audioFades(clips, clip) }, time);
}

export function imageTransform(value = {}) {
  value ||= {};
  const number = (key, fallback, min, max) => Number.isFinite(Number(value[key])) ? clamp(Number(value[key]), min, max) : fallback;
  return { zoom: number('zoom', 1, .1, 10), x: number('x', 0, -5, 5), y: number('y', 0, -5, 5) };
}

export function imagePlacement(clip, rect, imageWidth, imageHeight) {
  const transform = imageTransform(clip.imageTransform), ratio = (clip.fit === 'cover' ? Math.max : Math.min)(rect.w / imageWidth, rect.h / imageHeight) * transform.zoom;
  const w = imageWidth * ratio, h = imageHeight * ratio;
  return { x: rect.x + (rect.w - w) / 2 + transform.x * rect.w, y: rect.y + (rect.h - h) / 2 + transform.y * rect.h, w, h };
}
