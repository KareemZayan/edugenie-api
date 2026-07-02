export const QUIZ_REGEN_ENROLLMENT_THRESHOLD = Number(
  process.env.QUIZ_REGEN_ENROLLMENT_THRESHOLD ?? 30,
);
console.log('QUIZ_REGEN_ENROLLMENT_THRESHOLD loaded as:', QUIZ_REGEN_ENROLLMENT_THRESHOLD);

// Maximum number of approved quizzes allowed per section
export const MAX_QUIZZES_PER_SECTION = Number(
  process.env.MAX_QUIZZES_PER_SECTION ?? 5,
);
// console.log('MAX_QUIZZES_PER_SECTION loaded as:', MAX_QUIZZES_PER_SECTION);