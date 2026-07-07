import { OpenAiTranscriptionProvider } from './openai-transcription.provider';

describe('OpenAiTranscriptionProvider', () => {
  const key = process.env.OPEN_AI_API_KEY;
  const model = process.env.OPEN_AI_TRANSCRIBE_MODEL;
  afterEach(() => {
    key === undefined ? delete process.env.OPEN_AI_API_KEY : (process.env.OPEN_AI_API_KEY = key);
    model === undefined ? delete process.env.OPEN_AI_TRANSCRIBE_MODEL : (process.env.OPEN_AI_TRANSCRIBE_MODEL = model);
  });

  it('is unconfigured without a key and defaults to whisper-1', () => {
    delete process.env.OPEN_AI_API_KEY;
    delete process.env.OPEN_AI_TRANSCRIBE_MODEL;
    const p = new OpenAiTranscriptionProvider();
    expect(p.isConfigured).toBe(false);
    expect(p.model).toBe('whisper-1');
  });

  it('is configured with a key and honors OPEN_AI_TRANSCRIBE_MODEL', () => {
    process.env.OPEN_AI_API_KEY = 'sk-test';
    process.env.OPEN_AI_TRANSCRIBE_MODEL = 'whisper-large';
    const p = new OpenAiTranscriptionProvider();
    expect(p.isConfigured).toBe(true);
    expect(p.model).toBe('whisper-large');
  });

  it('throws when transcribing without a key (no network hit)', async () => {
    delete process.env.OPEN_AI_API_KEY;
    await expect(
      new OpenAiTranscriptionProvider().transcribeSegments('https://x/a.mp3'),
    ).rejects.toThrow();
  });
});
