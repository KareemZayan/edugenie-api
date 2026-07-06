import { Types } from 'mongoose';
import { RetrievalService } from './retrieval.service';

// In-Node backend (RAG_USE_VECTOR_SEARCH unset → default). Verifies scoped
// retrieval applies the caller filter + the active-provider model match, and
// returns courseId on each hit for deep-linking.
describe('RetrievalService.retrieveScoped (in-Node)', () => {
  const embeddings = {
    model: 'gemini-embedding-001',
    dims: 768,
    isConfigured: true,
    embed: jest.fn().mockResolvedValue([[1, 0]]),
  };

  const makeChunkModel = (rows: any[]) => {
    const find = jest.fn().mockReturnValue({
      select: () => ({ lean: () => ({ exec: () => Promise.resolve(rows) }) }),
    });
    return { find } as any;
  };

  it('returns [] when embeddings are not configured', async () => {
    const svc = new RetrievalService(
      makeChunkModel([]),
      {} as any,
      { ...embeddings, isConfigured: false } as any,
    );
    expect(await svc.retrieveScoped('q', { courseId: new Types.ObjectId() })).toEqual([]);
  });

  it('applies the caller filter + model match and returns courseId hits', async () => {
    const courseId = new Types.ObjectId();
    const chunkModel = makeChunkModel([
      {
        courseId,
        lessonId: new Types.ObjectId(),
        lessonTitle: 'L',
        sectionId: new Types.ObjectId(),
        sectionTitle: 'S',
        text: 'closures explained',
        embedding: [1, 0],
      },
    ]);
    const svc = new RetrievalService(chunkModel, {} as any, embeddings as any);

    const filter = { $or: [{ courseId }] };
    const hits = await svc.retrieveScoped('closures', filter, 5);

    const passed = chunkModel.find.mock.calls[0][0];
    expect(passed).toMatchObject({ $or: [{ courseId }], model: 'gemini-embedding-001' });
    expect(hits[0]).toMatchObject({ courseId: courseId.toString(), text: 'closures explained' });
    expect(hits[0].score).toBeCloseTo(1); // identical vectors → cosine 1
  });
});
