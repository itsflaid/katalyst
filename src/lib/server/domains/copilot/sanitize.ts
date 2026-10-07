export function sanitizeText(value: string, maxLength = 80): string {
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2028\u2029\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
