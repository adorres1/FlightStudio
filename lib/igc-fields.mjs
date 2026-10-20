// I/J field positions are one-based and inclusive. Unknown fields stay raw:
// https://www.fai.org/sites/default/files/igc_fr_specification_with_al8_2023-2-1_0.pdf
export function extensionSchema(line) {
  const count = Number(line.slice(1, 3)), fields = [];
  if (!Number.isInteger(count) || count < 0 || line.length < 3 + count * 7) return fields;
  for (let i = 0; i < count; i++) {
    const chunk = line.slice(3 + i * 7, 10 + i * 7);
    const start = Number(chunk.slice(0, 2)), end = Number(chunk.slice(2, 4)), code = chunk.slice(4);
    if (start >= (line[0] === 'I' ? 36 : 8) && end >= start && /^[A-Z0-9]{3}$/.test(code))
      fields.push({ code, start: start - 1, end });
  }
  return fields;
}
export function readExtensions(line, schema) {
  const fields = {};
  for (const { code, start, end } of schema)
    if (line.length >= end && line.slice(start, end).trim()) fields[code] = line.slice(start, end).trim();
  return fields;
}
export const decimalSeconds = fields => /^\d+$/.test(fields.TDS || '') ? Number('0.' + fields.TDS) : 0;
export const coordinateDecimals = value => /^\d+$/.test(value || '') ? Number('0.000' + value) / 60 : 0;
