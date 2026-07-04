import { GeminiTranscriptionProvider } from './gemini-transcription.provider';

/**
 * Unit tests with a mocked global.fetch — no network. Exercises the
 * request/response contract of the Gemini transcription call.
 */
describe('GeminiTranscriptionProvider', () => {
  const realFetch = global.fetch;
  const realKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    global.fetch = realFetch;
    process.env.GEMINI_API_KEY = realKey;
  });

  const mockFetch = (audioBytes: Uint8Array, geminiJson: unknown) => {
    global.fetch = jest.fn(async (url: any) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => geminiJson,
          text: async () => JSON.stringify(geminiJson),
        } as any;
      }
      // audio download
      return {
        ok: true,
        arrayBuffer: async () => audioBytes.buffer,
      } as any;
    }) as any;
  };

  it('downloads audio, posts inline_data, returns parsed transcript', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockFetch(new Uint8Array([1, 2, 3]), {
      candidates: [{ content: { parts: [{ text: 'hello ' }, { text: 'world' }] } }],
    });

    const provider = new GeminiTranscriptionProvider();
    const text = await provider.transcribeAudioUrl('https://cdn/x.mp3');

    expect(text).toBe('hello world');
    // second fetch call is the Gemini generateContent POST
    const calls = (global.fetch as jest.Mock).mock.calls;
    const geminiCall = calls.find((c) =>
      String(c[0]).includes(':generateContent'),
    );
    expect(geminiCall).toBeDefined();
    expect(geminiCall![1].headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(geminiCall![1].body);
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('audio/mpeg');
    expect(typeof body.contents[0].parts[0].inline_data.data).toBe('string');
  });

  it('returns empty string for non-speech audio', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockFetch(new Uint8Array([0]), {
      candidates: [{ content: { parts: [{ text: '' }] } }],
    });
    const provider = new GeminiTranscriptionProvider();
    expect(await provider.transcribeAudioUrl('https://cdn/x.mp3')).toBe('');
  });

  it('throws when GEMINI_API_KEY is not configured', async () => {
    delete process.env.GEMINI_API_KEY;
    const provider = new GeminiTranscriptionProvider();
    await expect(provider.transcribeAudioUrl('https://cdn/x.mp3')).rejects.toThrow();
  });
});
