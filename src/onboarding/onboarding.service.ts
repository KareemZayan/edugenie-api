import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schema/user.schema';
import { RoadmapService } from '../ai/roadmap.service';
import { BuildRoadmapDto } from '../ai/dto/build-roadmap.dto';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

type OnboardingAnswers = SubmitOnboardingDto & { profileSummary?: string };

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly roadmap: RoadmapService,
  ) {}

  /** Whether the student still needs to onboard (drives the frontend gate). */
  async getStatus(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('isVerified hasOnboarded onboarding')
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return {
      isVerified: !!user.isVerified,
      hasOnboarded: !!user.hasOnboarded,
      onboarding: user.onboarding ?? null,
    };
  }

  /**
   * Persist onboarding answers + generate the student's first roadmap.
   * Answers are saved BEFORE roadmap generation so a generation failure never
   * loses them (the frontend can retry via `generateRoadmap`). The first
   * roadmap is attempt-exempt (does not consume the monthly quota).
   */
  async submit(userId: string, dto: SubmitOnboardingDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.isVerified) {
      throw new ForbiddenException('Verify your email before onboarding.');
    }

    const firstTime = !user.hasOnboarded;
    const profileSummary = this.buildProfileSummary(dto);

    user.set('onboarding', {
      specialization: dto.specialization,
      currentLevel: dto.currentLevel,
      hoursPerWeek: dto.hoursPerWeek,
      pace: dto.pace,
      priorExperience: dto.priorExperience,
      endGoal: dto.endGoal,
      learningStyle: dto.learningStyle,
      knownTopics: dto.knownTopics ?? [],
      focusTopics: dto.focusTopics ?? [],
      extraNotes: dto.extraNotes,
      profileSummary,
      completedAt: new Date(),
    });
    // These used to be collected on the register form (step 4). Registration now
    // stops at credentials, so onboarding is the single place they're captured
    // — and they surface (editable) on the profile: level ← currentLevel,
    // interests ← topics they want to focus on, skills ← topics they already know.
    user.set('level', dto.currentLevel);
    if (dto.focusTopics?.length) user.set('interests', dto.focusTopics);
    if (dto.knownTopics?.length) user.set('skills', dto.knownTopics);
    user.hasOnboarded = true;
    await user.save();

    // Free (attempt-exempt) first roadmap. A failure here must NOT undo the
    // saved answers or block the user — surface it so the UI can offer a retry.
    let roadmap: Awaited<ReturnType<RoadmapService['build']>> | null = null;
    let roadmapError: string | undefined;
    try {
      roadmap = await this.roadmap.build(
        userId,
        this.toRoadmapDto(dto, profileSummary),
        { skipQuota: firstTime },
      );
    } catch (e) {
      roadmapError = (e as Error)?.message ?? 'Roadmap generation failed';
      this.logger.warn(`Onboarding roadmap build failed: ${roadmapError}`);
    }

    return { hasOnboarded: true, roadmap, roadmapError };
  }

  /**
   * Retry the first roadmap from already-saved onboarding answers. Stays free
   * (attempt-exempt) only while the student has no active roadmap yet — so it
   * can't be abused to bypass the monthly quota after the first success.
   */
  async generateRoadmap(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('hasOnboarded onboarding')
      .lean();
    if (!user?.hasOnboarded || !user.onboarding) {
      throw new ForbiddenException('Complete onboarding first.');
    }
    const existing = await this.roadmap.getActive(userId);
    const answers = user.onboarding as OnboardingAnswers;
    return this.roadmap.build(
      userId,
      this.toRoadmapDto(answers, answers.profileSummary ?? ''),
      { skipQuota: !existing },
    );
  }

  /** Map onboarding answers onto the existing roadmap intake DTO. */
  private toRoadmapDto(
    o: OnboardingAnswers,
    profileSummary: string,
  ): BuildRoadmapDto {
    return {
      goal: `${o.specialization}: ${o.endGoal}`.slice(0, 300),
      level: o.currentLevel,
      time: o.hoursPerWeek,
      timeline: o.pace,
      focus: o.focusTopics ?? [],
      // The rich, natural-language profile — the RAG + LLM read this verbatim.
      notes: profileSummary,
    };
  }

  /**
   * Distill the raw answers into a descriptive prose string. The AI/RAG
   * understands natural language far better than codes/labels, so we assemble a
   * profile like: "Intermediate-level student focused on … Goal: … Prior
   * experience: …".
   */
  private buildProfileSummary(o: SubmitOnboardingDto): string {
    const list = (xs?: string[]) => (xs ?? []).filter(Boolean).join(', ');
    const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
    const parts: string[] = [];

    parts.push(`${cap(o.currentLevel)}-level student focused on ${o.specialization}.`);
    parts.push(`Their goal is to ${o.endGoal.trim()}.`);
    if (o.priorExperience?.trim()) {
      parts.push(`Prior experience: ${o.priorExperience.trim()}.`);
    }
    if (o.focusTopics?.length) {
      parts.push(`Wants to focus on ${list(o.focusTopics)}.`);
    }
    if (o.knownTopics?.length) {
      parts.push(`Already comfortable with ${list(o.knownTopics)} (can skip these).`);
    }
    parts.push(
      `Has about ${o.hoursPerWeek} per week to learn and prefers a ${o.pace} pace.`,
    );
    if (o.learningStyle) {
      parts.push(`Prefers a ${o.learningStyle.replace(/-/g, ' ')} approach.`);
    }
    if (o.extraNotes?.trim()) {
      parts.push(`Additional context: ${o.extraNotes.trim()}.`);
    }
    return parts.join(' ').slice(0, 1200);
  }
}
