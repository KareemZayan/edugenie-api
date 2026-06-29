import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { User } from '../users/schema/user.schema';
import {
  Roadmap,
  RoadmapItem,
  RoadmapMilestone,
} from './schema/roadmap.schema';
import { CourseStatus } from '../common/enums/course-status.enum';
import { RetrievalService } from '../rag/retrieval.service';
import { AiService } from './ai.service';
import { BuildRoadmapDto } from './dto/build-roadmap.dto';

const MAX_GENERATIONS = 3;
const CANDIDATE_COURSES = 6;

interface CandidateSection {
  id: string;
  title: string;
  price: number | null;
}
interface Candidate {
  courseId: string;
  title: string;
  price: number;
  sections: CandidateSection[];
}

/** Raw shape we ask the model for (validated before use). */
interface PlanJson {
  summary?: string;
  milestones?: {
    title?: string;
    focus?: string;
    items?: { courseId?: string; sectionIds?: string[] | null; reason?: string }[];
  }[];
}

@Injectable()
export class RoadmapService {
  private readonly logger = new Logger(RoadmapService.name);

  constructor(
    @InjectModel(Roadmap.name) private roadmapModel: Model<Roadmap>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(User.name) private userModel: Model<User>,
    private retrieval: RetrievalService,
    private ai: AiService,
  ) {}

  // ── Quota ────────────────────────────────────────────────────────────────

  async remaining(userId: string): Promise<number> {
    const user = await this.userModel
      .findById(userId)
      .select('roadmapGenerationsUsed')
      .lean();
    const used = (user as { roadmapGenerationsUsed?: number })
      ?.roadmapGenerationsUsed ?? 0;
    return Math.max(0, MAX_GENERATIONS - used);
  }

  // ── Build ────────────────────────────────────────────────────────────────

  async build(userId: string, dto: BuildRoadmapDto) {
    const left = await this.remaining(userId);
    if (left <= 0) {
      throw new ForbiddenException(
        `You've used all ${MAX_GENERATIONS} roadmap generations.`,
      );
    }

    const candidates = await this.loadCandidates(dto);
    const plan = await this.generatePlan(dto, candidates).catch((e) => {
      this.logger.warn(`Roadmap plan generation failed: ${e?.message}`);
      return null;
    });

    const map = new Map(candidates.map((c) => [c.courseId, c]));
    let milestones = this.resolveMilestones(plan, map);
    if (!milestones.length) milestones = this.fallbackMilestones(candidates);
    if (!milestones.length) {
      throw new NotFoundException(
        'No published courses are available to build a roadmap yet.',
      );
    }

    const items = this.dedupeItems(milestones);
    const totalPrice = items.reduce((s, i) => s + i.price, 0);
    const summary =
      (plan?.summary && String(plan.summary).trim().slice(0, 400)) ||
      `Here's a step-by-step path toward "${dto.goal}". Work through the milestones in order.`;

    const doc = await this.roadmapModel.create({
      userId: new Types.ObjectId(userId),
      goal: dto.goal.trim(),
      level: dto.level ?? '',
      summary,
      milestones,
      items,
      totalPrice,
      status: 'active',
    });

    // Count the build against the lifetime cap (never decremented).
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $inc: { roadmapGenerationsUsed: 1 } },
    );

    return {
      ...this.serialize(doc),
      generationsRemaining: Math.max(0, left - 1),
    };
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async list(userId: string) {
    const docs = await this.roadmapModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((d) => this.serialize(d));
  }

  async getOne(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Roadmap not found');
    }
    const doc = await this.roadmapModel
      .findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .lean();
    if (!doc) throw new NotFoundException('Roadmap not found');
    return this.serialize(doc);
  }

  // ── Candidate catalog ──────────────────────────────────────────────────────

  private async loadCandidates(dto: BuildRoadmapDto): Promise<Candidate[]> {
    const query = [
      dto.goal,
      dto.level,
      dto.timeline,
      ...(dto.focus ?? []),
      dto.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const retrieved = await this.retrieval
      .retrieveCatalog(query || dto.goal, CANDIDATE_COURSES)
      .catch(() => []);
    const ids = retrieved
      .map((c) => c.courseId)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (!ids.length) return [];

    const courses = (await this.courseModel
      .find({ _id: { $in: ids }, courseStatus: CourseStatus.PUBLISHED })
      .select('title price sections._id sections.title sections.price')
      .lean()) as unknown as {
      _id: Types.ObjectId;
      title: string;
      price: number;
      sections: { _id: Types.ObjectId; title: string; price: number | null }[];
    }[];

    // Preserve retrieval relevance order.
    const order = new Map(retrieved.map((c, i) => [c.courseId, i]));
    return courses
      .map((c) => {
        const sections: CandidateSection[] = (c.sections ?? []).map((s) => ({
          id: String(s._id),
          title: s.title,
          price: s.price ?? null,
        }));
        return {
          courseId: String(c._id),
          title: c.title,
          price: c.price ?? 0,
          sections,
        };
      })
      .sort((a, b) => (order.get(a.courseId) ?? 99) - (order.get(b.courseId) ?? 99));
  }

  // ── LLM plan ───────────────────────────────────────────────────────────────

  private async generatePlan(
    dto: BuildRoadmapDto,
    candidates: Candidate[],
  ): Promise<PlanJson | null> {
    if (!candidates.length) return null;

    const catalog = candidates
      .map((c) => {
        const secs = c.sections
          .map(
            (s) =>
              `    - section ${s.id} "${s.title}"` +
              (typeof s.price === 'number' && s.price > 0
                ? ` ($${s.price})`
                : ' (not sold separately)'),
          )
          .join('\n');
        return `- course ${c.courseId} "${c.title}" (full course $${c.price})\n${secs}`;
      })
      .join('\n');

    const system =
      'You are an expert learning-path planner. You ONLY use the courses and ' +
      'section ids provided. You reply with VALID JSON only — no markdown, no ' +
      'commentary.';

    const user =
      `Student goal: ${dto.goal}.\n` +
      `Level: ${dto.level || 'unspecified'}. Time: ${dto.time || 'unspecified'}. ` +
      `Timeline: ${dto.timeline || 'flexible'}. ` +
      `Focus: ${(dto.focus ?? []).join(', ') || 'none'}. ` +
      `Notes: ${dto.notes || 'none'}.\n\n` +
      `Available catalog (use these EXACT ids only):\n${catalog}\n\n` +
      `Build an ordered roadmap of 3–5 milestones toward the goal. For each ` +
      `milestone, recommend one or more items. Prefer recommending SPECIFIC ` +
      `sections (via sectionIds) when the student only needs part of a course ` +
      `and those sections have a price; otherwise recommend the whole course ` +
      `(set sectionIds to null). Do NOT invent ids.\n\n` +
      `Return ONLY this JSON:\n` +
      `{ "summary": string, "milestones": [ { "title": string, "focus": string, ` +
      `"items": [ { "courseId": string, "sectionIds": string[] | null, ` +
      `"reason": string } ] } ] }`;

    const raw = await this.ai.complete(system, user, 1600);
    return this.parseJson(raw);
  }

  private parseJson(raw: string): PlanJson | null {
    if (!raw) return null;
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as PlanJson;
    } catch {
      return null;
    }
  }

  // ── Validation / resolution ──────────────────────────────────────────────

  private resolveMilestones(
    plan: PlanJson | null,
    map: Map<string, Candidate>,
  ): RoadmapMilestone[] {
    if (!plan || !Array.isArray(plan.milestones)) return [];
    const out: RoadmapMilestone[] = [];

    for (const m of plan.milestones.slice(0, 6)) {
      const items: RoadmapItem[] = [];
      for (const rawItem of m?.items ?? []) {
        const course = rawItem?.courseId && map.get(rawItem.courseId);
        if (!course) continue;

        const buyableSections = course.sections.filter(
          (s) => typeof s.price === 'number' && (s.price as number) > 0,
        );
        const wanted = Array.isArray(rawItem.sectionIds)
          ? course.sections.filter(
              (s) =>
                rawItem.sectionIds!.includes(s.id) &&
                typeof s.price === 'number' &&
                (s.price as number) > 0,
            )
          : [];

        // Specific sections — only when it's a real subset that's individually
        // priced; otherwise fall back to the full course.
        if (
          wanted.length > 0 &&
          wanted.length < buyableSections.length &&
          course.price > 0
        ) {
          for (const s of wanted) {
            items.push({
              type: 'section',
              courseId: course.courseId,
              sectionId: s.id,
              title: s.title,
              courseTitle: course.title,
              price: s.price as number,
              reason: rawItem.reason?.slice(0, 240),
            });
          }
        } else {
          items.push({
            type: 'course',
            courseId: course.courseId,
            title: course.title,
            courseTitle: course.title,
            price: course.price,
            reason: rawItem.reason?.slice(0, 240),
          });
        }
      }
      if (items.length) {
        out.push({
          title: String(m?.title ?? 'Milestone').slice(0, 120),
          focus: String(m?.focus ?? '').slice(0, 300),
          items,
        });
      }
    }
    return out;
  }

  private fallbackMilestones(candidates: Candidate[]): RoadmapMilestone[] {
    return candidates.slice(0, 3).map((c, i) => ({
      title: `Step ${i + 1}: ${c.title}`,
      focus: '',
      items: [
        {
          type: 'course' as const,
          courseId: c.courseId,
          title: c.title,
          courseTitle: c.title,
          price: c.price,
        },
      ],
    }));
  }

  /** Distinct purchasable items; a full course supersedes its own sections. */
  private dedupeItems(milestones: RoadmapMilestone[]): RoadmapItem[] {
    const all = milestones.flatMap((m) => m.items);
    const fullCourses = new Set(
      all.filter((i) => i.type === 'course').map((i) => i.courseId),
    );
    const seen = new Set<string>();
    const out: RoadmapItem[] = [];
    for (const i of all) {
      if (i.type === 'section' && fullCourses.has(i.courseId)) continue;
      const key =
        i.type === 'course' ? `c:${i.courseId}` : `s:${i.courseId}:${i.sectionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(i);
    }
    return out;
  }

  // ── Serialize ────────────────────────────────────────────────────────────

  private serialize(doc: Roadmap & { _id?: Types.ObjectId; createdAt?: Date }) {
    return {
      id: String(doc._id),
      goal: doc.goal,
      level: doc.level,
      summary: doc.summary,
      milestones: doc.milestones,
      items: doc.items,
      totalPrice: doc.totalPrice,
      status: doc.status,
      purchasedAt: doc.purchasedAt ?? null,
      createdAt: doc.createdAt ?? null,
    };
  }
}
