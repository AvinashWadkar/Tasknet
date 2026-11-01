import type { SurveyRatingKey } from '@/lib/survey-questions'

/**
 * Client-safe DTOs for the admin feedback report. Shared by the server-side
 * report builder and the admin UI (which must not import the Prisma-backed
 * `@/lib/survey` module).
 */

export interface SurveyDistributionBucket {
  score: number
  count: number
  pct: number
}

export interface SurveyQuestionScore {
  key: SurveyRatingKey
  label: string
  shortLabel: string
  low: string
  high: string
  average: number
  positive: number
  positiveRate: number
  distribution: SurveyDistributionBucket[]
}

export interface SurveyResponseRow {
  id: string
  userId: string
  name: string
  employeeCode: string
  process: string
  designation: string
  overall: number
  easeOfUse: number
  taskClarity: number
  notifications: number
  recommend: number
  average: number
  likedMost: string | null
  improvements: string | null
  comments: string | null
  createdAt: string
}

export interface SurveyProcessRow {
  process: string
  employees: number
  submitted: number
  responseRate: number
  avgOverall: number
  avgRecommend: number
  recommendRate: number
}

export interface SurveyPendingRow {
  id: string
  name: string
  employeeCode: string
  process: string
  designation: string
}

export interface SurveyKpis {
  eligibleEmployees: number
  submitted: number
  pending: number
  responseRate: number
  avgOverall: number
  avgEaseOfUse: number
  avgTaskClarity: number
  avgNotifications: number
  avgRecommend: number
  recommendRate: number
  satisfiedEmployees: number
  satisfiedRate: number
  commentCount: number
}

export interface SurveyReport {
  generatedAt: string
  kpis: SurveyKpis
  questions: SurveyQuestionScore[]
  byProcess: SurveyProcessRow[]
  responses: SurveyResponseRow[]
  pending: SurveyPendingRow[]
}
