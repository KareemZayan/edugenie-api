import { chunkSegments } from './chunking';

describe('chunkSegments', () => {
  it('returns [] for no segments', () => {
    expect(chunkSegments([])).toEqual([]);
  });

  it('packs consecutive segments and keeps the first segment start', () => {
    const out = chunkSegments(
      [
        { start: 0, text: 'Hello world.' },
        { start: 3, text: 'This is a lesson.' },
        { start: 7, text: 'About closures.' },
      ],
      { maxChars: 40 },
    );
    // 'Hello world. This is a lesson.' = 30 chars ≤ 40; +' About closures.' > 40 → new chunk
    expect(out).toEqual([
      { start: 0, text: 'Hello world. This is a lesson.' },
      { start: 7, text: 'About closures.' },
    ]);
  });

  it('skips blank segments and defaults a negative/invalid start to 0', () => {
    const out = chunkSegments([
      { start: -5, text: 'kept' },
      { start: 2, text: '   ' },
    ]);
    expect(out).toEqual([{ start: 0, text: 'kept' }]);
  });

  it('hard-splits a single oversized segment, sharing its start', () => {
    const long = 'a'.repeat(100);
    const out = chunkSegments([{ start: 12, text: long }], { maxChars: 40 });
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.start === 12)).toBe(true);
    expect(out.map((c) => c.text).join('')).toBe(long);
  });
});
