import {
  Injectable,
  Logger,
  ForbiddenException,
  ServiceUnavailableException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { User } from '../users/schema/user.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { RetrievalService } from '../rag/retrieval.service';
import type { RetrievedChunk, RetrievedCourse } from '../rag/retrieval.service';
import { QuestionType } from '../common/enums/questionsType.enum';
import { QuizDifficulty } from '../common/enums/quizDifficulty.enum';

/** Shape returned by the quiz generator — matches the QuizQuestion subdocument. */
export interface GeneratedQuizQuestion {
  questionText: string;
  type: QuestionType;
  options: string[];
  correctAnswers: string[];
}

/** One prior turn of a chat conversation, supplied by the client. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A message in the SBG gateway request body (conversation only — no system). */
interface GatewayMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Shared answer-style directive appended to every tutor system prompt so replies
 * are short, focused, and cleanly formatted for the chat UI (which renders
 * markdown). Kept terse — it rides on every request.
 */
const ANSWER_STYLE =
  `\n\n=== HOW TO ANSWER ===\n` +
  `- Give the shortest complete answer — usually 1–3 sentences. No preamble, ` +
  `no restating the question, no summary at the end.\n` +
  `- Answer ONLY what was asked. Cut every tangent, background, and filler word.\n` +
  `- If listing steps or items, use a few short bullets instead of paragraphs.\n` +
  `- **Bold** the key term; put any code in a fenced code block.\n` +
  `- Warm but efficient — one line of encouragement at most, only if it fits.`;

/**
 * Hard on-topic guardrail appended to the lesson/section + course tutor prompts.
 * Forces the model to refuse anything outside the scoped material instead of
 * answering general questions — `scope` is e.g. `the section "Async" (course "Node")`.
 */
const stayOnTopic = (scope: string): string =>
  `\n\n=== STAY ON TOPIC (STRICT) ===\n` +
  `- You may ONLY answer questions about ${scope}. If the question is unrelated ` +
  `to this material — another subject, general knowledge, personal chit-chat, or ` +
  `anything outside ${scope} — do NOT answer it. Reply in one sentence that you can ` +
  `only help with ${scope}, and invite a relevant question.\n` +
  `- Ground every answer in the material provided below. If the material doesn't ` +
  `cover it, say so plainly — never invent facts, and never reveal content from ` +
  `sections the student hasn't unlocked.\n` +
  `- When the material DOES contain the answer, point the student to the exact ` +
  `moment(s); the cited timestamps are listed for you and appended to your reply.`;

/** Format seconds as m:ss or h:mm:ss (null when not time-coded). */
function fmtTime(sec?: number): string | null {
  if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) return null;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${ss}`
    : `${m}:${ss}`;
}

/**
 * AI features backed by the SBG gateway (an OpenAI-incompatible proxy to AWS
 * Bedrock / Claude). Everything is env-driven so it activates the moment the
 * gateway host + key are provided:
 *
 *   SBG_API_URL  e.g. https://<host>/api/v1   (the call goes to {URL}/student/chat)
 *   SBG_API_KEY  Bearer token (sbg_...)
 *   SBG_MODEL    Bedrock model id (default: anthropic.claude-3-haiku-20240307-v1:0)
 *
 * Until both URL and key are set, isConfigured is false and every AI call fails
 * fast with a clear "not configured" message — no crashes.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl = process.env.SBG_API_URL;
  private readonly apiKey = process.env.SBG_API_KEY;
  private readonly model =
    process.env.SBG_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0';

  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(User.name) private userModel: Model<User>,
    private enrollmentsService: EnrollmentsService,
    private retrieval: RetrievalService,
  ) {}

  /** True once the gateway host AND key are configured. */
  get isConfigured(): boolean {
    return !!this.apiUrl && !!this.apiKey;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Gateway transport
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Single call to the SBG gateway. Non-streaming: returns the full reply text.
   * The system prompt is sent separately from the conversation, per the
   * gateway's contract ({ model_id, messages, system_prompt, max_tokens }).
   */
  private async callGateway(
    systemPrompt: string,
    messages: GatewayMessage[],
    maxTokens = 1024,
  ): Promise<string> {
    this.assertConfigured();

    const url = `${this.apiUrl!.replace(/\/$/, '')}/student/chat`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: this.model,
          messages,
          system_prompt: systemPrompt,
          max_tokens: maxTokens,
        }),
      });
    } catch (err) {
      this.logger.error(
        `SBG gateway request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException(
        'AI service is currently unavailable. Please try again.',
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `SBG gateway returned ${response.status}: ${body.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'AI service is currently unavailable. Please try again.',
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'AI returned an unreadable response. Please try again.',
      );
    }

    const text = this.extractText(json);
    if (!text) {
      this.logger.error(
        `Could not find reply text in SBG response: ${JSON.stringify(
          json,
        ).slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'AI returned an empty response. Please try again.',
      );
    }
    return text.trim();
  }

  /**
   * Pull the assistant text out of the gateway response. The exact shape isn't
   * pinned yet, so we try the formats a Bedrock/Claude proxy is likely to use
   * (Anthropic messages, Bedrock Converse, OpenAI-style, and simple wrappers).
   */
  private extractText(json: unknown): string {
    if (typeof json === 'string') return json;
    if (!json || typeof json !== 'object') return '';
    const j = json as Record<string, any>;

    return (
      // Anthropic Messages API: { content: [{ type: 'text', text }] }
      (Array.isArray(j.content) ? j.content?.[0]?.text : undefined) ??
      // Bedrock Converse: { output: { message: { content: [{ text }] } } }
      j.output?.message?.content?.[0]?.text ??
      // OpenAI-style: { choices: [{ message: { content } }] }
      j.choices?.[0]?.message?.content ??
      j.choices?.[0]?.text ??
      // Simple wrappers
      (typeof j.content === 'string' ? j.content : undefined) ??
      j.message?.content ??
      (typeof j.message === 'string' ? j.message : undefined) ??
      j.reply ??
      j.completion ??
      j.output_text ??
      j.text ??
      j.data?.content ??
      j.data?.text ??
      ''
    );
  }

  private assertConfigured(): void {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'AI is not configured (set SBG_API_URL and SBG_API_KEY).',
      );
    }
  }

  private assertMessage(message: string): void {
    if (!message || !message.trim()) {
      throw new BadRequestException('Message is required');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Lesson REST chat (existing endpoint) — now contextual via the gateway
  // ───────────────────────────────────────────────────────────────────────────

  async chat(lessonId: string, studentId: string, message: string) {
    this.assertMessage(message);
    if (!Types.ObjectId.isValid(lessonId)) {
      throw new BadRequestException('Invalid lesson ID');
    }

    const hasAccess = await this.enrollmentsService.canAccessLesson(
      studentId,
      lessonId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'You must purchase this section to use the AI tutor',
      );
    }

    const ctx = await this.getLessonContext(lessonId);
    const reply = await this.callGateway(
      this.lessonSystemPrompt(ctx),
      [{ role: 'user', content: message }],
      1024,
    );
    return { reply };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AI quiz generation (non-streaming)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generate quiz questions from a section's lesson content via the gateway.
   * The model is asked for strict JSON, then every question is validated against
   * the requested type so malformed output can never reach the database.
   */
  async generateQuizQuestions(params: {
    sectionTitle: string;
    sectionDescription?: string;
    lessons: { title: string; transcript?: string }[];
    difficulty: QuizDifficulty;
    questionTypes: QuestionType[];
    numberOfQuestions: number;
  }): Promise<GeneratedQuizQuestion[]> {
    this.assertConfigured();

    if (!params.questionTypes || params.questionTypes.length === 0) {
      throw new BadRequestException(
        'At least one question type must be provided for AI generation.',
      );
    }

    const context = this.buildSectionContext(
      params.sectionTitle,
      params.sectionDescription,
      params.lessons,
    );
    const typeRules = this.questionTypeRules(params.questionTypes);

    const systemPrompt =
      'You are an expert instructional designer who writes high-quality ' +
      'assessment questions strictly grounded in the provided course material. ' +
      'You never invent facts outside the material. You always reply with valid ' +
      'JSON only — no markdown, no commentary.';

    const userPrompt =
      `Create exactly ${params.numberOfQuestions} ${params.difficulty} ` +
      `difficulty quiz questions based ONLY on the course material below.\n\n` +
      `${typeRules}\n\n` +
      `Return a JSON object of the form:\n` +
      `{ "questions": [ { "questionText": string, "type": ` +
      `"SINGLE_CHOICE" | "MULTI_CHOICE" | "TRUE_FALSE", "options": string[], ` +
      `"correctAnswers": string[] } ] }\n` +
      `Rules: every entry in "correctAnswers" MUST be an exact string from that ` +
      `question's "options". Do not number or letter the options. Do not add ` +
      `explanations.\n\n=== COURSE MATERIAL ===\n${context}`;

    // Budget enough tokens for the requested number of questions.
    const maxTokens = Math.min(4096, 400 + params.numberOfQuestions * 180);
    const raw = await this.callGateway(
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      maxTokens,
    );

    const parsed = this.parseJsonLoose(raw);
    if (!parsed) {
      this.logger.error('AI returned non-JSON quiz output');
      throw new ServiceUnavailableException(
        'AI returned an unreadable response. Please try again.',
      );
    }

    const candidates = Array.isArray(parsed.questions) ? parsed.questions : [];
    const valid = candidates
      .map((q) => this.normalizeQuestion(q, params.questionTypes))
      .filter((q): q is GeneratedQuizQuestion => q !== null)
      .slice(0, params.numberOfQuestions);

    if (valid.length === 0) {
      throw new ServiceUnavailableException(
        'AI could not produce valid questions from this section. Add lesson ' +
          'content (e.g. transcripts) or try again.',
      );
    }

    this.logger.log(
      `Generated ${valid.length}/${params.numberOfQuestions} questions for "${params.sectionTitle}"`,
    );
    return valid;
  }

  /** Tolerant JSON parse — handles code fences / surrounding prose. */
  private parseJsonLoose(text: string): { questions?: unknown[] } | null {
    const tryParse = (s: string): { questions?: unknown[] } | null => {
      try {
        return JSON.parse(s) as { questions?: unknown[] };
      } catch {
        return null;
      }
    };
    const direct = tryParse(text);
    if (direct) return direct;

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && tryParse(fenced[1])) return tryParse(fenced[1]);

    const braces = text.match(/\{[\s\S]*\}/);
    if (braces) return tryParse(braces[0]);

    return null;
  }

  private buildSectionContext(
    sectionTitle: string,
    sectionDescription: string | undefined,
    lessons: { title: string; transcript?: string }[],
  ): string {
    const MAX_PER_LESSON = 1500;
    const MAX_TOTAL = 8000;

    let ctx = `Section: ${sectionTitle}\n`;
    if (sectionDescription?.trim()) {
      ctx += `Section overview: ${sectionDescription.trim()}\n`;
    }
    ctx += `\nLessons:\n`;
    for (const lesson of lessons) {
      let piece = `- ${lesson.title}`;
      const transcript = lesson.transcript?.trim();
      if (transcript) {
        piece += `: ${transcript.slice(0, MAX_PER_LESSON)}`;
      }
      ctx += `${piece}\n`;
      if (ctx.length >= MAX_TOTAL) break;
    }
    return ctx.slice(0, MAX_TOTAL);
  }

  private questionTypeRules(types: QuestionType[]): string {
    if (types.length === 1) {
      const type = types[0];
      switch (type) {
        case QuestionType.SINGLE_CHOICE:
          return 'Every question must be type "SINGLE_CHOICE" with exactly 4 options and exactly 1 correct answer.';
        case QuestionType.MULTI_CHOICE:
          return 'Every question must be type "MULTI_CHOICE" with 4 to 5 options and 2 or more correct answers.';
        case QuestionType.TRUE_FALSE:
          return 'Every question must be type "TRUE_FALSE" with options exactly ["True","False"] and exactly 1 correct answer.';
        default:
          return 'Every question must be type "SINGLE_CHOICE" with exactly 4 options and exactly 1 correct answer.';
      }
    }

    // Multiple types: describe each one and instruct strict adherence
    const typeDescriptions: string[] = [];
    if (types.includes(QuestionType.SINGLE_CHOICE)) {
      typeDescriptions.push('"SINGLE_CHOICE" (exactly 4 options, exactly 1 correct answer)');
    }
    if (types.includes(QuestionType.MULTI_CHOICE)) {
      typeDescriptions.push('"MULTI_CHOICE" (4 to 5 options, 2 or more correct answers)');
    }
    if (types.includes(QuestionType.TRUE_FALSE)) {
      typeDescriptions.push('"TRUE_FALSE" (options must be exactly ["True","False"], exactly 1 correct answer)');
    }

    const typeList = types.map((t) => `"${t}"`).join(', ');
    return (
      `Every generated question must be one of: ${typeList}. ` +
      `You may mix these types freely, but MUST NOT generate any type outside this list. ` +
      `Type-specific rules: ${typeDescriptions.join('; ')}.`
    );
  }

  private normalizeQuestion(
    raw: unknown,
    allowedTypes: QuestionType[],
  ): GeneratedQuizQuestion | null {
    if (!raw || typeof raw !== 'object') return null;
    const q = raw as Record<string, unknown>;

    const questionText =
      typeof q.questionText === 'string' ? q.questionText.trim() : '';
    if (!questionText) return null;

    // If a single type was requested, override whatever the AI returned.
    // Otherwise, ensure the returned type is in the allowed set.
    let type = q.type as QuestionType;
    if (allowedTypes.length === 1) {
      type = allowedTypes[0];
    } else if (!allowedTypes.includes(type)) {
      return null;
    }

    const toStringArray = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

    if (type === QuestionType.TRUE_FALSE) {
      const correctRaw = toStringArray(q.correctAnswers);
      if (correctRaw.length !== 1) return null;
      const correct = /^t/i.test(correctRaw[0]) ? 'True' : 'False';
      return {
        questionText,
        type,
        options: ['True', 'False'],
        correctAnswers: [correct],
      };
    }

    const options = [...new Set(toStringArray(q.options))];
    if (options.length < 2) return null;

    let correctAnswers = [
      ...new Set(
        toStringArray(q.correctAnswers).filter((c) => options.includes(c)),
      ),
    ];
    if (correctAnswers.length === 0) return null;

    if (type === QuestionType.SINGLE_CHOICE && correctAnswers.length > 1) {
      correctAnswers = [correctAnswers[0]];
    }

    return { questionText, type, options, correctAnswers };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Three-tier chatbot (SRS): lesson / course / global roadmap.
  // The gateway is non-streaming, so each generator fetches the full reply and
  // yields it word-by-word — preserving the WebSocket token/done protocol. If a
  // streaming gateway endpoint appears later, only streamReply() changes.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Tier 1 — tutor scoped to the WHOLE SECTION the lesson belongs to (not just
   * the one lesson). Access requires owning that section (or the full course).
   * Answers are grounded in the section's transcripts and cite the exact
   * timestamped moment when the point exists; otherwise stay within the
   * section's topic.
   */
  async *streamLessonChat(
    lessonId: string,
    studentId: string,
    message: string,
    history: ChatTurn[] = [],
  ): AsyncGenerator<string> {
    this.assertConfigured();
    this.assertMessage(message);
    if (!Types.ObjectId.isValid(lessonId)) {
      throw new BadRequestException('Invalid lesson ID');
    }
    // Section-level gate: owning any lesson means owning its section (or the
    // full course) — canAccessLesson resolves lesson → section → ownership.
    const hasAccess = await this.enrollmentsService.canAccessLesson(
      studentId,
      lessonId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'You must purchase this section to use the AI tutor',
      );
    }

    const ctx = await this.getSectionContextByLesson(lessonId);

    // RAG scoped to the ENTIRE section (all its lessons), so the tutor can
    // answer across the section and cite the exact lesson + timestamp.
    const chunks = await this.retrieval
      .retrieve({
        query: message,
        courseId: ctx.courseId,
        sectionIds: [ctx.sectionId],
        k: 6,
      })
      .catch(() => [] as RetrievedChunk[]);

    const systemPrompt = chunks.length
      ? this.groundedSectionPrompt(ctx.sectionTitle, ctx.courseTitle, chunks)
      : this.sectionSystemPrompt(ctx);

    yield* this.streamReply(systemPrompt, [
      ...this.trimHistory(history),
      { role: 'user', content: message },
    ]);

    // Cite the exact moments the answer drew from (timestamp deep-links).
    if (chunks.length) yield* this.streamSources(chunks, ctx.courseId);
  }

  /** Tier 2 — tutor scoped to an entire course the student has access to. */
  async *streamCourseChat(
    courseId: string,
    studentId: string,
    message: string,
    history: ChatTurn[] = [],
  ): AsyncGenerator<string> {
    this.assertConfigured();
    this.assertMessage(message);
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid course ID');
    }
    const access = await this.enrollmentsService.getCourseAccess(
      studentId,
      courseId,
    );
    // Course tutor needs the WHOLE course — a full-course enrollment, or every
    // section owned (same as the frontend's `every(isOwned)` unlock). Partial
    // owners use the section tutor (lesson chat) for the sections they own.
    const ownsWholeCourse =
      !!access &&
      (access.accessType === PurchaseType.FULL_COURSE ||
        (access.totalSections > 0 &&
          access.accessibleSections.length === access.totalSections));
    if (!ownsWholeCourse) {
      throw new ForbiddenException(
        'Buy the full course to use the course tutor.',
      );
    }

    const ctx = await this.getCourseContext(
      courseId,
      access.accessibleSections,
    );

    // RAG: retrieve the most relevant lesson excerpts across the sections the
    // student has unlocked, ground the answer, and cite the source lessons.
    const chunks = await this.retrieval
      .retrieve({
        query: message,
        courseId,
        sectionIds: access.accessibleSections,
        k: 6,
      })
      .catch(() => [] as RetrievedChunk[]);

    const systemPrompt = chunks.length
      ? this.groundedCoursePrompt(ctx.courseTitle, chunks)
      : `You are EduGenie's AI tutor for the course "${ctx.courseTitle}". Use the ` +
        `course outline and material to answer questions, connect concepts across ` +
        `lessons, and guide their study.\n\n` +
        `=== COURSE OUTLINE & MATERIAL ===\n${ctx.material}` +
        stayOnTopic(`the course "${ctx.courseTitle}"`) +
        ANSWER_STYLE;

    yield* this.streamReply(systemPrompt, [
      ...this.trimHistory(history),
      { role: 'user', content: message },
    ]);

    // Cite the lessons the answer drew from (tier-2 spans multiple lessons).
    if (chunks.length) yield* this.streamSources(chunks, courseId);
  }

  /** Tier 3 — global advisor that builds a personalized learning roadmap. */
  async *streamRoadmap(
    studentId: string,
    goal: string,
    message: string,
    history: ChatTurn[] = [],
  ): AsyncGenerator<string> {
    this.assertConfigured();
    const userMessage = (message || goal || '').trim();
    if (!userMessage) {
      throw new BadRequestException('A goal or message is required');
    }

    const user = await this.userModel
      .findById(studentId)
      .select('skills interests level firstName')
      .lean<{
        skills?: string[];
        interests?: string[];
        level?: string;
      }>()
      .exec();

    const skills = user?.skills?.length
      ? user.skills.join(', ')
      : 'none specified';
    const interests = user?.interests?.length
      ? user.interests.join(', ')
      : 'none specified';
    const level = user?.level || 'unspecified';

    // RAG: surface REAL EduGenie courses that match the goal so the advisor
    // recommends enrollable courses instead of inventing them.
    // Build the retrieval query from the WHOLE interview so far (goal + the
    // student's answers), so recommended courses fit everything gathered — not
    // just the opening message.
    const answersSoFar = history
      .filter((t) => t.role === 'user')
      .slice(-5)
      .map((t) => t.content)
      .join(' ');
    const retrievalQuery =
      `${goal} ${answersSoFar} ${message}`.trim() || userMessage;

    const courses = await this.retrieval
      .retrieveCatalog(retrievalQuery, 5)
      .catch(() => [] as RetrievedCourse[]);

    // The student fills a structured intake on the frontend (goal, level, time,
    // timeline, preferences), so the first message usually contains everything
    // needed — generate the roadmap directly. Only ask if something essential is
    // genuinely missing (e.g. a follow-up chat with no goal).
    const systemPrompt =
      `You are EduGenie's AI learning coach. Build a learning roadmap tailored ` +
      `to this student.\n` +
      `- If their message already gives the goal, current level, available time, ` +
      `and timeline, build the roadmap NOW — do NOT ask questions first.\n` +
      `- Only if an essential detail is truly missing, ask ONE short question to ` +
      `fill the gap, then build it.\n\n` +
      `Use what you know from their profile (do NOT re-ask it) — level: ${level}; ` +
      `skills: ${skills}; interests: ${interests}.` +
      (goal ? ` Stated goal: ${goal}.` : '') +
      `\n\nWHEN YOU BUILD THE ROADMAP:\n` +
      `- Use ordered milestones; for each, name the concrete skills to learn and ` +
      `estimate time using their weekly availability and timeline.\n` +
      `- Tailor everything to what they told you (level, time, timeline, focus).\n` +
      (courses.length
        ? `- Map milestones to these REAL EduGenie courses. Whenever you mention ` +
          `a course, write it as a markdown link using its EXACT title and the ` +
          `given link — e.g. [Course Title](/courses/ID). Do NOT invent courses ` +
          `or links:\n${this.formatCourses(courses)}\n`
        : '') +
      `- Finish with a short, encouraging next step.`;

    yield* this.streamReply(systemPrompt, [
      ...this.trimHistory(history),
      { role: 'user', content: userMessage },
    ]);
  }

  /**
   * Public streaming primitive for sibling AI features (e.g. the Learning
   * Coach) that build their own grounded system prompt: stream a paced reply
   * through the same gateway, history trimming, and Bedrock sanitiser as the
   * tutor tiers. Access/validation checks run before the first token, so the
   * SSE wrapper can surface them as proper HTTP errors.
   */
  async *streamGrounded(
    systemPrompt: string,
    userMessage: string,
    history: ChatTurn[] = [],
  ): AsyncGenerator<string> {
    this.assertConfigured();
    this.assertMessage(userMessage);
    yield* this.streamReply(systemPrompt, [
      ...this.trimHistory(history),
      { role: 'user', content: userMessage },
    ]);
  }

  /**
   * One-shot, non-streaming completion for sibling features that need a full
   * text reply they parse themselves (e.g. the roadmap planner's JSON).
   */
  async complete(
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 1500,
  ): Promise<string> {
    this.assertConfigured();
    return this.callGateway(
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      maxTokens,
    );
  }

  /**
   * Bedrock requires the conversation to START with a user message and to
   * alternate user/assistant roles. Drop any leading assistant turns (e.g. the
   * roadmap's seeded greeting) and merge consecutive same-role turns so the
   * payload is always valid.
   */
  private sanitizeForBedrock(messages: GatewayMessage[]): GatewayMessage[] {
    const out: GatewayMessage[] = [];
    for (const m of messages) {
      if (!m?.content?.trim()) continue;
      if (out.length === 0 && m.role !== 'user') continue; // must start with user
      const last = out[out.length - 1];
      if (last && last.role === m.role) {
        last.content = `${last.content}\n${m.content}`.slice(0, 4000);
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }

  /** Fetch a full reply, then yield it word-by-word (simulated streaming). */
  private async *streamReply(
    systemPrompt: string,
    messages: GatewayMessage[],
  ): AsyncGenerator<string> {
    const safe = this.sanitizeForBedrock(messages);
    const full = await this.callGateway(systemPrompt, safe, 1200);
    // Preserve whitespace so the reassembled text matches the original.
    const parts = full.match(/\S+\s*/g) ?? [full];
    // The gateway returns the whole reply at once. Pace the words with a small
    // delay so each SSE frame flushes separately and the client renders a
    // natural word-by-word "typing" stream instead of one instant burst.
    for (const part of parts) {
      yield part;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private lessonSystemPrompt(ctx: {
    lessonTitle: string;
    courseTitle: string;
    material: string;
  }): string {
    return (
      `You are EduGenie's AI tutor for the lesson "${ctx.lessonTitle}" in the ` +
      `course "${ctx.courseTitle}". Help the student understand THIS lesson. ` +
      `Prefer the lesson material below; if the answer isn't in it, say you can ` +
      `only help with this lesson's content and suggest what to re-watch.\n\n` +
      `=== LESSON MATERIAL ===\n${ctx.material}` +
      ANSWER_STYLE
    );
  }

  // ── RAG: grounded prompts + citations ──────────────────────────────────────

  private groundedLessonPrompt(
    lessonTitle: string,
    courseTitle: string,
    chunks: RetrievedChunk[],
  ): string {
    return (
      `You are EduGenie's AI tutor for the lesson "${lessonTitle}" in the course ` +
      `"${courseTitle}". Answer the student's question using PRIMARILY the ` +
      `excerpts from this lesson below. If the excerpts don't contain the answer, ` +
      `say you're not certain and suggest what to re-watch — do NOT invent facts. ` +
      `Be clear and concise.\n\n=== RELEVANT EXCERPTS ===\n` +
      this.formatExcerpts(chunks) +
      ANSWER_STYLE
    );
  }

  private groundedCoursePrompt(
    courseTitle: string,
    chunks: RetrievedChunk[],
  ): string {
    return (
      `You are EduGenie's AI tutor for the course "${courseTitle}". Answer using ` +
      `PRIMARILY the excerpts below. Connect concepts across lessons and reference ` +
      `lesson titles when helpful.\n\n` +
      `=== RELEVANT EXCERPTS ===\n` +
      this.formatExcerpts(chunks) +
      stayOnTopic(`the course "${courseTitle}"`) +
      ANSWER_STYLE
    );
  }

  /** Grounded tutor for a whole SECTION (tier-1, section-scoped). */
  private groundedSectionPrompt(
    sectionTitle: string,
    courseTitle: string,
    chunks: RetrievedChunk[],
  ): string {
    return (
      `You are EduGenie's AI tutor for the section "${sectionTitle}" in the course ` +
      `"${courseTitle}". Answer using PRIMARILY the excerpts from this section ` +
      `below, and reference the lesson each point comes from.\n\n` +
      `=== RELEVANT EXCERPTS ===\n` +
      this.formatExcerpts(chunks) +
      stayOnTopic(`the section "${sectionTitle}" of "${courseTitle}"`) +
      ANSWER_STYLE
    );
  }

  /** Non-RAG fallback for section chat (no indexed chunks). */
  private sectionSystemPrompt(ctx: {
    sectionTitle: string;
    courseTitle: string;
    material: string;
  }): string {
    return (
      `You are EduGenie's AI tutor for the section "${ctx.sectionTitle}" in the ` +
      `course "${ctx.courseTitle}". Help the student understand THIS section.\n\n` +
      `=== SECTION MATERIAL ===\n${ctx.material}` +
      stayOnTopic(`the section "${ctx.sectionTitle}" of "${ctx.courseTitle}"`) +
      ANSWER_STYLE
    );
  }

  private formatExcerpts(chunks: RetrievedChunk[]): string {
    return chunks
      .map((c, i) => {
        const at = fmtTime(c.start);
        const from = at
          ? `from lesson "${c.lessonTitle}" at ${at}`
          : `from lesson "${c.lessonTitle}"`;
        return `[${i + 1}] (${from})\n${c.text.trim()}`;
      })
      .join('\n\n');
  }

  private formatCourses(courses: RetrievedCourse[]): string {
    return courses
      .map(
        (c) =>
          `- "${c.title}" — link: /courses/${c.courseId} ` +
          `(${c.level || 'all levels'}, $${c.price}` +
          (c.ratingAverage ? `, rated ${c.ratingAverage.toFixed(1)}/5` : '') +
          `)` +
          (c.goals?.length
            ? `; covers: ${c.goals.slice(0, 4).join('; ')}`
            : ''),
      )
      .join('\n');
  }

  /**
   * Stream a compact "jump to" footer citing the exact MOMENTS the answer drew
   * from. Each distinct lesson is a deep-link into the player at the timestamp
   * of its top-ranked matching chunk — the client renders
   * `[Title — m:ss](/learn/<courseId>?lesson=<lessonId>&t=<seconds>)` as a
   * clickable link that seeks the video. Chunks arrive in relevance order, so
   * the first-seen chunk per lesson is the best moment for that lesson.
   */
  private async *streamSources(
    chunks: RetrievedChunk[],
    courseId: string,
  ): AsyncGenerator<string> {
    const seen = new Set<string>();
    const items: string[] = [];
    for (const c of chunks) {
      const id = c.lessonId;
      const title = c.lessonTitle?.trim();
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      const at = fmtTime(c.start);
      const t =
        typeof c.start === 'number' && isFinite(c.start) && c.start >= 0
          ? Math.floor(c.start)
          : null;
      const label = at ? `${title} — ${at}` : title;
      const href = !courseId
        ? null
        : t !== null
          ? `/learn/${courseId}?lesson=${id}&t=${t}`
          : `/learn/${courseId}?lesson=${id}`;
      items.push(href ? `[${label}](${href})` : label);
      if (items.length >= 4) break;
    }
    if (!items.length) return;
    yield `\n\n📚 Jump to: ${items.join(' · ')}`;
  }

  private trimHistory(history: ChatTurn[]): GatewayMessage[] {
    if (!Array.isArray(history)) return [];
    return history
      .filter(
        (t) =>
          t &&
          (t.role === 'user' || t.role === 'assistant') &&
          typeof t.content === 'string' &&
          t.content.trim().length > 0,
      )
      .slice(-8)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  }

  private async getLessonContext(lessonId: string): Promise<{
    lessonTitle: string;
    sectionTitle: string;
    courseTitle: string;
    material: string;
  }> {
    const course = await this.courseModel
      .findOne({ 'sections.lessons._id': new Types.ObjectId(lessonId) })
      .select('title sections')
      .lean<{
        title: string;
        sections: {
          title: string;
          lessons: {
            _id: Types.ObjectId;
            title: string;
            transcript?: string;
          }[];
        }[];
      }>()
      .exec();

    if (!course) throw new NotFoundException('Lesson not found');

    let lessonTitle = '';
    let sectionTitle = '';
    let transcript = '';
    for (const section of course.sections) {
      const lesson = section.lessons.find((l) => l._id.toString() === lessonId);
      if (lesson) {
        lessonTitle = lesson.title;
        sectionTitle = section.title;
        transcript = lesson.transcript ?? '';
        break;
      }
    }

    const material = transcript.trim()
      ? transcript.slice(0, 6000)
      : `(No transcript is available for this lesson. Lesson title: "${lessonTitle}".)`;

    return { lessonTitle, sectionTitle, courseTitle: course.title, material };
  }

  /**
   * Resolve a lessonId to its OWNING SECTION: the section id/title, the course
   * id/title, and section-wide material (all the section's lesson transcripts,
   * capped). Used by the section-scoped tutor.
   */
  private async getSectionContextByLesson(lessonId: string): Promise<{
    courseId: string;
    courseTitle: string;
    sectionId: string;
    sectionTitle: string;
    material: string;
  }> {
    const course = await this.courseModel
      .findOne({ 'sections.lessons._id': new Types.ObjectId(lessonId) })
      .select(
        'title sections._id sections.title sections.lessons._id sections.lessons.title sections.lessons.transcript',
      )
      .lean<{
        _id: Types.ObjectId;
        title: string;
        sections: {
          _id: Types.ObjectId;
          title: string;
          lessons: { _id: Types.ObjectId; title: string; transcript?: string }[];
        }[];
      }>()
      .exec();

    if (!course) throw new NotFoundException('Lesson not found');

    const section = course.sections.find((s) =>
      s.lessons.some((l) => l._id.toString() === lessonId),
    );
    if (!section) throw new NotFoundException('Lesson not found');

    // Concatenate the section's lesson transcripts (labeled), capped for the prompt.
    const parts: string[] = [];
    for (const l of section.lessons) {
      const tr = (l.transcript ?? '').trim();
      if (tr) parts.push(`## ${l.title}\n${tr}`);
    }
    const joined = parts.join('\n\n');
    const material = joined
      ? joined.slice(0, 8000)
      : `(No transcripts available for this section. Section: "${section.title}".)`;

    return {
      courseId: course._id.toString(),
      courseTitle: course.title,
      sectionId: section._id.toString(),
      sectionTitle: section.title,
      material,
    };
  }

  private async getCourseContext(
    courseId: string,
    accessibleSectionIds: string[],
  ): Promise<{ courseTitle: string; material: string }> {
    const course = await this.courseModel
      .findById(courseId)
      .select('title description sections')
      .lean<{
        title: string;
        description?: string;
        sections: {
          _id: Types.ObjectId;
          title: string;
          lessons: { title: string; transcript?: string }[];
        }[];
      }>()
      .exec();

    if (!course) throw new NotFoundException('Course not found');

    const unlocked = new Set(accessibleSectionIds);
    const MAX_TOTAL = 9000;
    let material = `Course: ${course.title}\n`;
    if (course.description?.trim()) {
      material += `Overview: ${course.description.trim()}\n`;
    }
    material += `\nOutline:\n`;

    for (const section of course.sections) {
      const isUnlocked = unlocked.has(section._id.toString());
      material += `# ${section.title}${isUnlocked ? '' : ' (locked)'}\n`;
      for (const lesson of section.lessons) {
        material += `- ${lesson.title}\n`;
        if (isUnlocked && lesson.transcript?.trim()) {
          material += `  ${lesson.transcript.trim().slice(0, 800)}\n`;
        }
        if (material.length >= MAX_TOTAL) break;
      }
      if (material.length >= MAX_TOTAL) break;
    }

    return {
      courseTitle: course.title,
      material: material.slice(0, MAX_TOTAL),
    };
  }
}
