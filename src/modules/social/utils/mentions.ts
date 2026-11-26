/** Extract @usernames from text (3–30 chars, alphanumeric + underscore). */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_]{3,30})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

/** Replace @username with a display-friendly token for rendering. */
export function splitCaptionWithMentions(text: string): Array<{ type: 'text' | 'mention'; value: string }> {
  const parts: Array<{ type: 'text' | 'mention'; value: string }> = [];
  const re = /@([a-zA-Z0-9_]{3,30})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'mention', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}
