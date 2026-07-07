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

export interface TranscriptSegment {
  start: number;
  text: string;
}

/** A chunk that remembers where in the video it starts (seconds). */
export interface TimedChunk {
  text: string;
  start: number;
}

/**
 * Time-aware variant of `chunkText`: pack consecutive timestamped segments into
 * embedding-sized windows, each window remembering the start time of its first
 * segment so a search hit can deep-link to that moment. No cross-window text
 * overlap here (a chunk's start must map cleanly to one segment); the small
 * recall loss at seams is acceptable for lesson-level seeking.
 */
export function chunkSegments(
  segments: TranscriptSegment[],
  opts: ChunkOptions = {},
): TimedChunk[] {
  const maxChars = opts.maxChars ?? 1800;
  const out: TimedChunk[] = [];

  let curText = '';
  let curStart = 0;
  const flush = () => {
    const t = curText.trim();
    if (t) out.push({ text: t, start: curStart });
    curText = '';
  };

  for (const seg of segments ?? []) {
    const text = (seg?.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const start = typeof seg?.start === 'number' && seg.start >= 0 ? seg.start : 0;

    // A single oversized segment: hard-split, all pieces share its start.
    if (text.length > maxChars * 1.5) {
      flush();
      for (let i = 0; i < text.length; i += maxChars) {
        const piece = text.slice(i, i + maxChars).trim();
        if (piece) out.push({ text: piece, start });
      }
      continue;
    }

    if (curText && curText.length + 1 + text.length > maxChars) flush();
    if (!curText) curStart = start;
    curText = curText ? `${curText} ${text}` : text;
  }
  flush();
  return out;
}
