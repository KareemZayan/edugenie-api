/**
 * Split a transcript into overlapping, sentence-aware windows for embedding.
 * Windows are sized in characters (~4 chars/token), packed on sentence
 * boundaries, with a small overlap so context isn't lost at the seams.
 */
export interface ChunkOptions {
  /** Target window size in characters (~450 tokens at 1800). */
  maxChars?: number;
  /** Overlap carried from the end of one window into the next. */
  overlapChars?: number;
}

export function chunkText(raw: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 1800;
  const overlap = opts.overlapChars ?? 250;

  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  // Greedily pack sentences into windows, prepending an overlap tail each time.
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const windows: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (current && current.length + s.length > maxChars) {
      windows.push(current.trim());
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = tail + s;
    } else {
      current += s;
    }
  }
  if (current.trim()) windows.push(current.trim());

  // Hard-split any window with no sentence breaks that's still oversized.
  const result: string[] = [];
  for (const w of windows) {
    if (w.length <= maxChars * 1.5) {
      result.push(w);
      continue;
    }
    for (let i = 0; i < w.length; i += maxChars - overlap) {
      const piece = w.slice(i, i + maxChars).trim();
      if (piece) result.push(piece);
    }
  }
  return result.filter(Boolean);
}
