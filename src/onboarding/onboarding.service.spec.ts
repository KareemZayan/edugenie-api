import { ForbiddenException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

const dto: SubmitOnboardingDto = {
  specialization: 'Web Development',
  currentLevel: 'intermediate',
  hoursPerWeek: '4-6 hours',
  pace: 'steady (3-6 months)',
  priorExperience: 'Built a couple of static sites',
  endGoal: 'Get a job',
  learningStyle: 'hands-on-first',
  knownTopics: ['HTML', 'CSS'],
  focusTopics: ['React', 'Node'],
  extraNotes: 'Prefer TypeScript',
};

function makeUserDoc(over: Record<string, unknown> = {}) {
  return {
    isVerified: true,
    hasOnboarded: false,
    set: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function make(userDoc: any, roadmap: any, leanUser?: any) {
  const userModel = {
    findById: jest.fn().mockImplementation(() => ({
      // .select().lean() chain for read paths
      select: () => ({ lean: () => Promise.resolve(leanUser) }),
      // bare await findById(...) for the mutable-doc path
      then: (res: any) => Promise.resolve(userDoc).then(res),
    })),
  };
  return new OnboardingService(userModel as any, roadmap as any);
}

describe('OnboardingService', () => {
  it('builds a natural-language profile summary and stores raw answers', async () => {
    const userDoc = makeUserDoc();
    const roadmap = { build: jest.fn().mockResolvedValue({ id: 'r1' }) };
    const svc = make(userDoc, roadmap);

    await svc.submit('u1', dto);

    const saved = userDoc.set.mock.calls[0][1];
    expect(saved.profileSummary).toContain('Intermediate-level student focused on Web Development');
    expect(saved.profileSummary).toContain('Prior experience: Built a couple of static sites');
    expect(saved.profileSummary).toContain('Wants to focus on React, Node');
    expect(saved.profileSummary).toContain('Already comfortable with HTML, CSS');
    expect(saved.knownTopics).toEqual(['HTML', 'CSS']);
    expect(userDoc.hasOnboarded).toBe(true);
    expect(userDoc.save).toHaveBeenCalled();
    // level + interests now come from onboarding (moved off the register form).
    const setCalls = Object.fromEntries(userDoc.set.mock.calls);
    expect(setCalls.level).toBe('intermediate');
    expect(setCalls.interests).toEqual(['React', 'Node']); // focusTopics
    expect(setCalls.skills).toEqual(['HTML', 'CSS']); // knownTopics
  });

  it('generates the first roadmap attempt-exempt (skipQuota) and maps the DTO', async () => {
    const userDoc = makeUserDoc();
    const roadmap = { build: jest.fn().mockResolvedValue({ id: 'r1' }) };
    const svc = make(userDoc, roadmap);

    const res = await svc.submit('u1', dto);

    expect(roadmap.build).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        goal: 'Web Development: Get a job',
        level: 'intermediate',
        time: '4-6 hours',
        timeline: 'steady (3-6 months)',
        focus: ['React', 'Node'],
        notes: expect.stringContaining('Intermediate-level student'),
      }),
      { skipQuota: true },
    );
    expect(res.roadmap).toEqual({ id: 'r1' });
  });

  it('persists answers even when roadmap generation fails, surfacing an error', async () => {
    const userDoc = makeUserDoc();
    const roadmap = { build: jest.fn().mockRejectedValue(new Error('LLM down')) };
    const svc = make(userDoc, roadmap);

    const res = await svc.submit('u1', dto);

    expect(userDoc.save).toHaveBeenCalled(); // answers saved first
    expect(userDoc.hasOnboarded).toBe(true);
    expect(res.roadmap).toBeNull();
    expect(res.roadmapError).toBe('LLM down');
  });

  it('rejects onboarding when the email is not verified', async () => {
    const userDoc = makeUserDoc({ isVerified: false });
    const roadmap = { build: jest.fn() };
    const svc = make(userDoc, roadmap);

    await expect(svc.submit('u1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(roadmap.build).not.toHaveBeenCalled();
  });

  it('retry stays free only while no active roadmap exists', async () => {
    const answers = { ...dto, profileSummary: 'summary text' };
    const roadmap = {
      getActive: jest.fn().mockResolvedValue(null),
      build: jest.fn().mockResolvedValue({ id: 'r2' }),
    };
    const svc = make(makeUserDoc(), roadmap, {
      hasOnboarded: true,
      onboarding: answers,
    });

    await svc.generateRoadmap('u1');
    expect(roadmap.build).toHaveBeenCalledWith('u1', expect.any(Object), {
      skipQuota: true,
    });
  });

  it('retry consumes quota once an active roadmap already exists', async () => {
    const answers = { ...dto, profileSummary: 'summary text' };
    const roadmap = {
      getActive: jest.fn().mockResolvedValue({ id: 'existing' }),
      build: jest.fn().mockResolvedValue({ id: 'r3' }),
    };
    const svc = make(makeUserDoc(), roadmap, {
      hasOnboarded: true,
      onboarding: answers,
    });

    await svc.generateRoadmap('u1');
    expect(roadmap.build).toHaveBeenCalledWith('u1', expect.any(Object), {
      skipQuota: false,
    });
  });
});
