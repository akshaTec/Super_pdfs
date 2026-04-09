export function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  const parts = cleaned.split(/(?<=[.!?])\s+(?=[A-Z\d"'([])/);
  return parts.map((s) => s.trim()).filter((s) => s.length > 1);
}
