const clamp = (v, a, b) => Math.min(Math.max(a, b), Math.max(a, v));
const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

// Select a callout position that stays on screen and covers as little of the
// highlighted control as possible. Also used when the window is resized.
export function placeCallout(target, card, viewport) {
  const margin = 12, gap = 22;
  const width = Math.min(card.width, Math.max(1, viewport.width - margin * 2));
  const height = Math.min(card.height, Math.max(1, viewport.height - margin * 2));
  if (!target) return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, arrow: null };
  const cx = (target.left + target.right) / 2, cy = (target.top + target.bottom) / 2;
  const candidates = [
    [target.right + gap, cy - height / 2], [target.left - width - gap, cy - height / 2],
    [cx - width / 2, target.bottom + gap], [cx - width / 2, target.top - height - gap],
  ].map(([rawX, rawY]) => {
    const x = clamp(rawX, margin, viewport.width - width - margin), y = clamp(rawY, margin, viewport.height - height - margin);
    return { x, y, score: area({ left: x, top: y, right: x + width, bottom: y + height }, target) * 100 + Math.abs(x - rawX) + Math.abs(y - rawY) };
  });
  const { x, y } = candidates.sort((a, b) => a.score - b.score)[0];
  const start = { x: clamp(cx, x + 10, x + width - 10), y: clamp(cy, y + 10, y + height - 10) };
  if (cx < x) start.x = x; else if (cx > x + width) start.x = x + width;
  else start.y = cy < y ? y : y + height;
  const end = { x: clamp(start.x, target.left, target.right), y: clamp(start.y, target.top, target.bottom) };
  const arrow = Math.hypot(start.x - end.x, start.y - end.y) > 12 ? { start, end } : null;
  return { x, y, arrow };
}
