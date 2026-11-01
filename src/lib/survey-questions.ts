/**
 * Client-safe survey metadata + validation helpers.
 *
 * Kept separate from `@/lib/survey` (which imports Prisma for the report) so
 * the mandatory survey modal can import the questions without pulling the
 * database client into the browser bundle.
 */

export const SURVEY_RATING_KEYS = ['overall', 'easeOfUse', 'taskClarity', 'notifications', 'recommend'] as const
export type SurveyRatingKey = (typeof SURVEY_RATING_KEYS)[number]

export interface SurveyQuestionMeta {
  key: SurveyRatingKey
  label: string
  shortLabel: string
  /** Label shown under "1" on the rating scale. */
  low: string
  /** Label shown under "5" on the rating scale. */
  high: string
}

/** The five mandatory 1–5 rating questions, in display order. */
export const SURVEY_QUESTIONS: SurveyQuestionMeta[] = [
  {
    key: 'overall',
    label: 'Overall, how satisfied are you with Tasknet?',
    shortLabel: 'Overall satisfaction',
    low: 'Very dissatisfied',
    high: 'Very satisfied',
  },
  {
    key: 'easeOfUse',
    label: 'How easy is Tasknet to use?',
    shortLabel: 'Ease of use',
    low: 'Very difficult',
    high: 'Very easy',
  },
  {
    key: 'taskClarity',
    label: 'How well does Tasknet help you stay on top of your tasks?',
    shortLabel: 'Staying on top of tasks',
    low: 'Not at all',
    high: 'Completely',
  },
  {
    key: 'notifications',
    label: 'How useful are the task notifications?',
    shortLabel: 'Notification usefulness',
    low: 'Not useful',
    high: 'Very useful',
  },
  {
    key: 'recommend',
    label: 'How likely are you to recommend Tasknet to a colleague?',
    shortLabel: 'Would recommend',
    low: 'Not at all likely',
    high: 'Extremely likely',
  },
]

/** The three optional free-text questions. */
export const SURVEY_COMMENT_KEYS = ['likedMost', 'improvements', 'comments'] as const
export type SurveyCommentKey = (typeof SURVEY_COMMENT_KEYS)[number]

export const SURVEY_COMMENTS: { key: SurveyCommentKey; label: string; placeholder: string }[] = [
  {
    key: 'likedMost',
    label: 'What do you like most about Tasknet?',
    placeholder: 'e.g. Everything I need to do is in one place…',
  },
  {
    key: 'improvements',
    label: 'What should we improve?',
    placeholder: 'e.g. I would like a weekly summary of my pending tasks…',
  },
  {
    key: 'comments',
    label: 'Anything else you would like to share?',
    placeholder: 'Optional — any other feedback for the team…',
  },
]

export const SURVEY_MAX_COMMENT = 2000

export function parseRating(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

export function cleanComment(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, SURVEY_MAX_COMMENT)
}
