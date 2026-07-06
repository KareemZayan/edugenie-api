import { OpenAiEmbeddingsProvider } from './openai-embeddings.provider';

describe('OpenAiEmbeddingsProvider', () => {
  const original = process.env.OPEN_AI_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.OPEN_AI_API_KEY;
    else process.env.OPEN_AI_API_KEY = original;
  });

  it('is unconfigured without a key and reports model/dims', () => {
    delete process.env.OPEN_AI_API_KEY;
    const p = new OpenAiEmbeddingsProvider();
    expect(p.isConfigured).toBe(false);
    expect(p.model).toBe('text-embedding-3-small');
    expect(p.dims).toBe(768);
  });

  it('is configured once the key is set', () => {
    process.env.OPEN_AI_API_KEY = 'sk-test';
    expect(new OpenAiEmbeddingsProvider().isConfigured).toBe(true);
  });

  it('returns [] for empty input without calling the API', async () => {
    process.env.OPEN_AI_API_KEY = 'sk-test';
    const spy = jest.spyOn(global, 'fetch' as any);
    expect(await new OpenAiEmbeddingsProvider().embed([], 'document')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
