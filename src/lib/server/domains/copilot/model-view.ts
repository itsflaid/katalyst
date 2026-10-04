export function toModelView(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toModelView);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (typeof source[`${key}Text`] === 'string') continue;
    out[key] = toModelView(item);
  }
  return out;
}
