import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { User } from '../users/schema/user.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import {
  Roadmap,
  RoadmapItem,
  RoadmapMilestone,
} from './schema/roadmap.schema';
import { CourseStatus } from '../common/enums/course-status.enum';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { RetrievalService } from '../rag/retrieval.service';
import { AiService } from './ai.service';
import { BuildRoadmapDto } from './dto/build-roadmap.dto';
import { UpdateRoadmapDto } from './dto/update-roadmap.dto';

// Roadmap builds allowed per calendar month.
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
  benefits?: string[];
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
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    private retrieval: RetrievalService,
    private ai: AiService,
  ) {}

  // ── Quota (3 per calendar month) ───────────────────────────────────────────

  /** Current month as 'YYYY-MM'. */
  private currentMonthKey(): string {
    return new Date().toISOString().slice(0, 7);
  }

  async remaining(userId: string): Promise<number> {
    const user = await this.userModel
      .findById(userId)
      .select('roadmapGenerationsUsed roadmapQuotaMonth')
      .lean<{ roadmapGenerationsUsed?: number; roadmapQuotaMonth?: string }>();
    // A new month means the stored count is stale → full quota again.
    if (!user || user.roadmapQuotaMonth !== this.currentMonthKey()) {
      return MAX_GENERATIONS;
    }
    return Math.max(0, MAX_GENERATIONS - (user.roadmapGenerationsUsed ?? 0));
  }

  /** Count one build against this month's quota (resetting on a new month). */
  private async consumeGeneration(userId: string): Promise<void> {
    const month = this.currentMonthKey();
    const user = await this.userModel
      .findById(userId)
      .select('roadmapQuotaMonth')
      .lean<{ roadmapQuotaMonth?: string }>();
    if (user?.roadmapQuotaMonth === month) {
      await this.userModel.updateOne(
        { _id: new Types.ObjectId(userId) },
        { $inc: { roadmapGenerationsUsed: 1 } },
      );
    } else {
      await this.userModel.updateOne(
        { _id: new Types.ObjectId(userId) },
        { $set: { roadmapQuotaMonth: month, roadmapGenerationsUsed: 1 } },
      );
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────

  async build(userId: string, dto: BuildRoadmapDto) {
    const left = await this.remaining(userId);
    if (left <= 0) {
      throw new ForbiddenException(
        `You've used all ${MAX_GENERATIONS} roadmap generations this month.`,
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
    const benefits = this.resolveBenefits(plan, dto, milestones);

    // Single-active model: a user keeps ONE active roadmap. Collapse any legacy
    // duplicate active drafts first, then — if the current active one has already
    // been (partly) bought, archive it to history rather than lose it; otherwise
    // the upsert below overwrites it in place.
    await this.normalizeActive(userId);
    await this.archiveActiveIfOwned(userId);

    const doc = await this.roadmapModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), status: 'active' },
      {
        $set: {
          goal: dto.goal.trim(),
          level: dto.level ?? '',
          summary,
          benefits,
          milestones,
          items,
          totalPrice,
        },
        $setOnInsert: { status: 'active', purchasedAt: null },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await this.consumeGeneration(userId);

    return {
      ...this.serialize(doc as Roadmap & { _id: Types.ObjectId }),
      generationsRemaining: Math.max(0, left - 1),
    };
  }

  /** Archive the active roadmap to 'purchased' if the student owns ≥1 item. */
  private async archiveActiveIfOwned(userId: string): Promise<void> {
    const active = await this.roadmapModel
      .findOne({ userId: new Types.ObjectId(userId), status: 'active' })
      .lean<{ _id: Types.ObjectId; items: RoadmapItem[] }>();
    if (!active || !active.items?.length) return;
    if (await this.ownsAnyItem(userId, active.items)) {
      await this.roadmapModel.updateOne(
        { _id: active._id },
        { $set: { status: 'purchased', purchasedAt: new Date() } },
      );
    }
  }

  /** True if the student already owns any of these roadmap items. */
  private async ownsAnyItem(
    userId: string,
    items: RoadmapItem[],
  ): Promise<boolean> {
    const studentId = new Types.ObjectId(userId);
    const courseIds = [
      ...new Set(items.map((i) => i.courseId).filter(Boolean)),
    ].map((id) => new Types.ObjectId(id));
    if (!courseIds.length) return false;

    const enrollments = await this.enrollmentModel
      .find({ studentId, courseId: { $in: courseIds } })
      .lean<
        Array<{
          courseId: Types.ObjectId;
          type: PurchaseType;
          sectionIds: Types.ObjectId[];
        }>
      >();
    if (!enrollments.length) return false;

    const byCourse = new Map(enrollments.map((e) => [e.courseId.toString(), e]));
    return items.some((i) => {
      const e = byCourse.get(i.courseId);
      if (!e) return false;
      if (e.type === PurchaseType.FULL_COURSE) return true;
      if (i.type === 'course') return false; // section access ≠ full course
      return e.sectionIds?.some((s) => s.toString() === i.sectionId);
    });
  }

  /** AI benefits when present + valid, else derived generic ones. */
  private resolveBenefits(
    plan: PlanJson | null,
    dto: BuildRoadmapDto,
    milestones: RoadmapMilestone[],
  ): string[] {
    const fromAi = Array.isArray(plan?.benefits)
      ? plan!.benefits
          .filter((b): b is string => typeof b === 'string' && !!b.trim())
          .map((b) => b.trim().slice(0, 160))
          .slice(0, 5)
      : [];
    if (fromAi.length >= 2) return fromAi;

    const courseCount = new Set(
      milestones.flatMap((m) => m.items).map((i) => i.courseId),
    ).size;
    return [
      `A clear, ordered path toward "${dto.goal}".`,
      `Curated from ${courseCount} relevant course${courseCount === 1 ? '' : 's'} in the catalog.`,
      'Buy only the parts you need — sections or full courses.',
      'Track progress milestone by milestone.',
    ];
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

  /**
   * Enforce the single-active invariant: keep the NEWEST active roadmap and prune
   * older orphaned active drafts. Legacy rows exist from before the single-active
   * model (build used to insert a new doc each time), and they'd otherwise
   * resurface one-by-one after a save/rebuild — looking like a roadmap the user
   * never generated. Returns the surviving active doc (or null). Scoped to this
   * user + status:'active' only; saved/purchased roadmaps are never touched.
   */
  private async normalizeActive(
    userId: string,
  ): Promise<(Roadmap & { _id: Types.ObjectId; createdAt?: Date }) | null> {
    const actives = await this.roadmapModel
      .find({ userId: new Types.ObjectId(userId), status: 'active' })
      .sort({ createdAt: -1 })
      .lean<Array<Roadmap & { _id: Types.ObjectId; createdAt?: Date }>>();
    if (!actives.length) return null;
    if (actives.length > 1) {
      await this.roadmapModel.deleteMany({
        _id: { $in: actives.slice(1).map((d) => d._id) },
      });
    }
    return actives[0];
  }

  /** The user's single active roadmap (for rehydrating the advisor page). */
  async getActive(userId: string) {
    const doc = await this.normalizeActive(userId);
    return doc ? this.serialize(doc) : null;
  }

  /**
   * "Save & buy later": promote the active draft to a kept 'saved' roadmap in the
   * profile. Frees the active slot so a fresh build won't overwrite this one.
   */
  async save(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Roadmap not found');
    }
    const doc = await this.roadmapModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
        status: 'active',
      },
      { $set: { status: 'saved' } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Roadmap not found');
    return this.serialize(doc as Roadmap & { _id: Types.ObjectId });
  }

  // ── Edit / delete ──────────────────────────────────────────────────────────

  /**
   * Replace an active roadmap's milestones (covers remove / reorder / add). Every
   * incoming item is re-validated against the published catalog and re-priced
   * from the DB — the client's prices/titles are never trusted. `items` and
   * `totalPrice` are recomputed. Purchased roadmaps are read-only.
   */
  async update(userId: string, id: string, dto: UpdateRoadmapDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Roadmap not found');
    }
    const existing = await this.roadmapModel
      .findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .lean<{ status: string }>();
    if (!existing) throw new NotFoundException('Roadmap not found');
    if (existing.status !== 'active') {
      throw new BadRequestException("Purchased roadmaps can't be edited.");
    }

    const milestones = await this.validateAndPriceItems(dto.milestones ?? []);
    if (!milestones.length) {
      throw new BadRequestException(
        'A roadmap needs at least one milestone with a valid item.',
      );
    }
    const items = this.dedupeItems(milestones);
    const totalPrice = items.reduce((s, i) => s + i.price, 0);

    const doc = await this.roadmapModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
      { $set: { milestones, items, totalPrice } },
      { new: true },
    );
    return this.serialize(doc as Roadmap & { _id: Types.ObjectId });
  }

  async remove(userId: string, id: string): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Roadmap not found');
    }
    const res = await this.roadmapModel.deleteOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });
    if (!res.deletedCount) throw new NotFoundException('Roadmap not found');
    return { deleted: true };
  }

  /**
   * Re-validate + re-price client-edited milestones against the published
   * catalog. Unknown courses/sections and non-sellable sections are dropped;
   * every kept item's title/courseTitle/price is snapshotted from the DB.
   */
  private async validateAndPriceItems(
    milestones: UpdateRoadmapDto['milestones'],
  ): Promise<RoadmapMilestone[]> {
    const courseIds = [
      ...new Set(
        (milestones ?? [])
          .flatMap((m) => m.items ?? [])
          .map((i) => i.courseId)
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));

    const courses = courseIds.length
      ? ((await this.courseModel
          .find({ _id: { $in: courseIds }, courseStatus: CourseStatus.PUBLISHED })
          .select('title price sections._id sections.title sections.price')
          .lean()) as unknown as Array<{
          _id: Types.ObjectId;
          title: string;
          price: number;
          sections: { _id: Types.ObjectId; title: string; price: number | null }[];
        }>)
      : [];
    const byId = new Map(courses.map((c) => [String(c._id), c]));

    const out: RoadmapMilestone[] = [];
    for (const m of milestones ?? []) {
      const items: RoadmapItem[] = [];
      for (const raw of m.items ?? []) {
        const course = byId.get(raw.courseId);
        if (!course) continue;
        if (raw.type === 'section') {
          const section = course.sections?.find(
            (s) => String(s._id) === raw.sectionId,
          );
          if (!section || !(typeof section.price === 'number' && section.price > 0)) {
            continue; // not individually sellable
          }
          items.push({
            type: 'section',
            courseId: String(course._id),
            sectionId: String(section._id),
            title: section.title,
            courseTitle: course.title,
            price: section.price,
            reason: raw.reason?.slice(0, 240),
          });
        } else {
          if (!(course.price > 0)) continue;
          items.push({
            type: 'course',
            courseId: String(course._id),
            title: course.title,
            courseTitle: course.title,
            price: course.price,
            reason: raw.reason?.slice(0, 240),
          });
        }
      }
      if (items.length) {
        out.push({
          title: String(m.title ?? 'Milestone').slice(0, 120),
          focus: String(m.focus ?? '').slice(0, 300),
          items,
        });
      }
    }
    return out;
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
      `Also give 3–5 short "benefits" bullets (what the student gains by ` +
      `following this plan).\n\n` +
      `Return ONLY this JSON:\n` +
      `{ "summary": string, "benefits": string[], "milestones": [ { "title": string, ` +
      `"focus": string, "items": [ { "courseId": string, "sectionIds": string[] | null, ` +
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
      benefits: doc.benefits ?? [],
      milestones: doc.milestones,
      items: doc.items,
      totalPrice: doc.totalPrice,
      status: doc.status,
      purchasedAt: doc.purchasedAt ?? null,
      createdAt: doc.createdAt ?? null,
    };
  }
}
