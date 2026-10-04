export type Primitive = 'string' | 'number' | 'integer' | 'boolean';

export interface ArgRule {
  type: Primitive;
  required?: boolean;
  enum?: readonly (string | number | boolean)[];
  min?: number;
  max?: number;
}

export type ArgSchema = Record<string, ArgRule>;

export type ValidationResult = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

export function validateArgs(input: unknown, schema: ArgSchema): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, message: 'Argumen harus berupa objek.' };
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!(key in schema)) return { ok: false, message: `Argumen tidak dikenal: ${key}.` };
  }
  for (const [key, rule] of Object.entries(schema)) {
    const item = value[key];
    if (item === undefined) {
      if (rule.required) return { ok: false, message: `Argumen ${key} wajib diisi.` };
      continue;
    }
    const validType =
      rule.type === 'integer'
        ? typeof item === 'number' && Number.isInteger(item)
        : typeof item === rule.type;
    if (!validType) return { ok: false, message: `Argumen ${key} tidak valid.` };
    if (rule.enum && !rule.enum.includes(item as string | number | boolean)) return { ok: false, message: `Nilai ${key} tidak didukung.` };
    if (typeof item === 'number' && ((rule.min !== undefined && item < rule.min) || (rule.max !== undefined && item > rule.max))) {
      return { ok: false, message: `Nilai ${key} di luar batas.` };
    }
  }
  return { ok: true, value };
}
