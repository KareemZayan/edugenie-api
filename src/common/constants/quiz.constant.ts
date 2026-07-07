export const QUIZ_REGEN_ENROLLMENT_THRESHOLD = Number(
  process.env.QUIZ_REGEN_ENROLLMENT_THRESHOLD ?? 30,
);
console.log('QUIZ_REGEN_ENROLLMENT_THRESHOLD loaded as:', QUIZ_REGEN_ENROLLMENT_THRESHOLD);

// Maximum number of approved quizzes allowed per section
export const MAX_QUIZZES_PER_SECTION = Number(
  process.env.MAX_QUIZZES_PER_SECTION ?? 5,
);
// console.log('MAX_QUIZZES_PER_SECTION loaded as:', MAX_QUIZZES_PER_SECTION);

// Maximum number of pending_review quizzes allowed per section
export const MAX_PENDING_QUIZZES_PER_SECTION = Number(
  process.env.MAX_PENDING_QUIZZES_PER_SECTION ?? 5,
);

/**
 * Maximum total questions a single quiz document may contain.
 * This limit applies to ALL questions regardless of origin:
 * AI-generated, instructor-authored, or instructor-added after generation.
 *
 * Every validation in the codebase must reference this constant —
 * never hardcode 5 anywhere else.
 */
export const MAX_QUESTIONS_PER_QUIZ = 5;