import PptxGenJS from 'pptxgenjs'
import type { SurveyQuestionScore, SurveyReport } from '@/lib/survey-types'
import type { ProcessUsageRow, UsageReport } from '@/lib/usage-report'
import { fmtDate } from '@/lib/dates'

/**
 * Management pitch deck (PPTX) for Tasknet.
 *
 * Built from the same two live reports the admin console shows - adoption &
 * usage (`buildUsageReport`) and the employee feedback survey
 * (`buildSurveyReport`) - so the slides can never drift from the numbers an
 * admin sees on screen.
 *
 * The deck is written for a management audience: what the tool is worth, how
 * deeply it is used, what employees say about it, and what to do next. It uses
 * only measured figures; no estimated savings are invented.
 */

const BRAND = '2E4566'
const BRAND_DARK = '1C2D45'
const BRAND_MID = '253956'
const BRAND_SOFT = 'F0F4F9'
const BRAND_LINE = 'DFE6F1'
const TEXT = '1F2937'
const SLATE = '475569'
const MUTED = '7C8DA6'
const LINE = 'E2E8F0'
const EMERALD = '059669'
const EMERALD_SOFT = 'ECFDF5'
const AMBER = 'B45309'
const AMBER_SOFT = 'FFFBEB'
const ROSE = 'B91C1C'
const WHITE = 'FFFFFF'

const FONT = 'Segoe UI'
const PAGE_W = 10
const PAGE_H = 5.625
const MARGIN = 0.5
const CONTENT_W = PAGE_W - MARGIN * 2

const DIST_COLORS = [ROSE, 'EA580C', 'D97706', '34D399', EMERALD]

interface DeckInput {
  survey: SurveyReport
  usage: UsageReport
  preparedBy: string
  preparedByCode: string
}

type Slide = ReturnType<PptxGenJS['addSlide']>

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return fmtDate(d)
}

function clampText(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${cut.slice(0, space > max * 0.6 ? space : max).trimEnd()}…`
}

/** Pick readable, varied verbatims: prefer substantive but not essay-length. */
function pickQuotes(values: { text: string; name: string; process: string; designation: string }[], count: number) {
  const seen = new Set<string>()
  const ranked = values
    .map((v) => ({ ...v, text: clampText(v.text) }))
    .filter((v) => v.text.length > 0)
    .filter((v) => {
      const key = v.text.toLowerCase().slice(0, 40)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const score = (t: string) => (t.length >= 90 && t.length <= 220 ? 2 : t.length >= 45 ? 1 : 0)
      return score(b.text) - score(a.text)
    })
  return ranked.slice(0, count)
}

const ACTION_BY_QUESTION: Record<string, string> = {
  overall: 'run a short listening round with the lowest-scoring teams to find what is missing.',
  easeOfUse: 'invest in first-week onboarding and in-app guidance for new users.',
  taskClarity: 'tighten how tasks are written and assigned - clear priority, owner and due date.',
  notifications: 'tune notification timing and volume so alerts stay useful instead of noisy.',
  recommend: 'capture the specific objections from the employees who would not recommend it and fix the top two.',
}

export async function buildPitchDeck({ survey, usage, preparedBy, preparedByCode }: DeckInput): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Tasknet'
  pptx.company = 'Tasknet'
  pptx.title = 'Tasknet - Management review'
  pptx.subject = 'Adoption, employee experience and the business case'

  const today = shortDate(new Date().toISOString())
  const k = usage.kpis
  const s = survey.kpis
  const hasSurvey = s.submitted > 0
  const strongest: SurveyQuestionScore | null = hasSurvey
    ? survey.questions.reduce((a, b) => (b.average > a.average ? b : a))
    : null
  const weakest: SurveyQuestionScore | null = hasSurvey
    ? survey.questions.reduce((a, b) => (b.average < a.average ? b : a))
    : null

  // ── Shared chrome ────────────────────────────────────────────────────────
  pptx.defineSlideMaster({
    title: 'CONTENT',
    background: { color: WHITE },
    objects: [
      { rect: { x: 0, y: 0, w: PAGE_W, h: 0.07, fill: { color: BRAND } } },
      { rect: { x: MARGIN, y: 5.18, w: CONTENT_W, h: 0.008, fill: { color: LINE } } },
      {
        text: {
          text: 'Tasknet · Management review',
          options: { x: MARGIN, y: 5.23, w: 6, h: 0.24, fontSize: 8, color: MUTED, fontFace: FONT },
        },
      },
    ],
    slideNumber: { x: 9.0, y: 5.23, w: 0.5, h: 0.24, fontSize: 8, color: MUTED, align: 'right', fontFace: FONT },
  })

  const addSlide = (title: string, kicker?: string): Slide => {
    const slide = pptx.addSlide({ masterName: 'CONTENT' })
    if (kicker) {
      slide.addText(kicker.toUpperCase(), {
        x: MARGIN,
        y: 0.3,
        w: CONTENT_W,
        h: 0.2,
        fontSize: 8.5,
        bold: true,
        charSpacing: 1.4,
        color: MUTED,
        fontFace: FONT,
      })
      slide.addText(title, {
        x: MARGIN,
        y: 0.5,
        w: CONTENT_W,
        h: 0.46,
        fontSize: 22,
        bold: true,
        color: BRAND,
        fontFace: FONT,
      })
    } else {
      slide.addText(title, {
        x: MARGIN,
        y: 0.42,
        w: CONTENT_W,
        h: 0.5,
        fontSize: 24,
        bold: true,
        color: BRAND,
        fontFace: FONT,
      })
    }
    return slide
  }

  const card = (
    slide: Slide,
    opts: {
      x: number
      y: number
      w: number
      h: number
      label: string
      value: string
      sub?: string
      tone?: 'brand' | 'emerald' | 'amber'
    }
  ) => {
    const tone = opts.tone ?? 'brand'
    const accent = tone === 'emerald' ? EMERALD : tone === 'amber' ? AMBER : BRAND
    const soft = tone === 'emerald' ? EMERALD_SOFT : tone === 'amber' ? AMBER_SOFT : BRAND_SOFT
    slide.addShape(pptx.ShapeType.roundRect, {
      x: opts.x,
      y: opts.y,
      w: opts.w,
      h: opts.h,
      rectRadius: 0.06,
      fill: { color: WHITE },
      line: { color: LINE, width: 0.75 },
      shadow: { type: 'outer', color: 'D9E1EC', blur: 4, offset: 1, angle: 90, opacity: 0.5 },
    })
    slide.addShape(pptx.ShapeType.roundRect, {
      x: opts.x,
      y: opts.y,
      w: 0.055,
      h: opts.h,
      rectRadius: 0.02,
      fill: { color: accent },
      line: { color: accent, width: 0 },
    })
    slide.addShape(pptx.ShapeType.roundRect, {
      x: opts.x + 0.18,
      y: opts.y + 0.13,
      w: Math.max(0.24, opts.label.length * 0.052),
      h: 0.03,
      rectRadius: 0.01,
      fill: { color: soft },
      line: { color: soft, width: 0 },
    })
    slide.addText(opts.label, {
      x: opts.x + 0.18,
      y: opts.y + 0.17,
      w: opts.w - 0.3,
      h: 0.24,
      fontSize: 8.5,
      bold: true,
      color: SLATE,
      fontFace: FONT,
      valign: 'top',
    })
    slide.addText(opts.value, {
      x: opts.x + 0.18,
      y: opts.y + 0.4,
      w: opts.w - 0.3,
      h: 0.44,
      fontSize: 24,
      bold: true,
      color: accent,
      fontFace: FONT,
      valign: 'top',
      fit: 'shrink',
    })
    if (opts.sub) {
      slide.addText(opts.sub, {
        x: opts.x + 0.18,
        y: opts.y + opts.h - 0.36,
        w: opts.w - 0.3,
        h: 0.3,
        fontSize: 8,
        color: MUTED,
        fontFace: FONT,
        valign: 'top',
        fit: 'shrink',
      })
    }
  }

  const callout = (slide: Slide, opts: { x: number; y: number; w: number; h: number; title: string; body: string; tone?: 'brand' | 'amber' }) => {
    const tone = opts.tone ?? 'brand'
    const accent = tone === 'amber' ? AMBER : BRAND
    const soft = tone === 'amber' ? AMBER_SOFT : BRAND_SOFT
    slide.addShape(pptx.ShapeType.roundRect, {
      x: opts.x,
      y: opts.y,
      w: opts.w,
      h: opts.h,
      rectRadius: 0.06,
      fill: { color: soft },
      line: { color: tone === 'amber' ? 'FDE68A' : BRAND_LINE, width: 0.75 },
    })
    slide.addText(opts.title, {
      x: opts.x + 0.16,
      y: opts.y + 0.13,
      w: opts.w - 0.32,
      h: 0.26,
      fontSize: 10,
      bold: true,
      color: accent,
      fontFace: FONT,
    })
    slide.addText(opts.body, {
      x: opts.x + 0.16,
      y: opts.y + 0.4,
      w: opts.w - 0.32,
      h: opts.h - 0.52,
      fontSize: 9.5,
      color: TEXT,
      fontFace: FONT,
      valign: 'top',
      lineSpacingMultiple: 1.12,
      fit: 'shrink',
    })
  }

  const bullets = (slide: Slide, items: string[], opts: { x: number; y: number; w: number; h: number; size?: number; color?: string }) => {
    slide.addText(
      items.map((text) => ({
        text,
        options: { bullet: { code: '2022' }, breakLine: true },
      })),
      {
        x: opts.x,
        y: opts.y,
        w: opts.w,
        h: opts.h,
        fontSize: opts.size ?? 11,
        color: opts.color ?? TEXT,
        fontFace: FONT,
        valign: 'top',
        lineSpacingMultiple: 1.18,
        paraSpaceAfter: 5,
        fit: 'shrink',
      }
    )
  }

  const table = (
    slide: Slide,
    rows: { text: string; options?: Record<string, unknown> }[][],
    opts: { x: number; y: number; w: number; colW: number[]; fontSize?: number; rowH?: number }
  ) => {
    slide.addTable(rows, {
      x: opts.x,
      y: opts.y,
      w: opts.w,
      colW: opts.colW,
      rowH: opts.rowH,
      fontFace: FONT,
      fontSize: opts.fontSize ?? 9.5,
      color: TEXT,
      valign: 'middle',
      border: { type: 'solid', color: LINE, pt: 0.5 },
      autoPage: false,
    })
  }

  const headerCells = (labels: string[], align: ('left' | 'right' | 'center')[] = []) =>
    labels.map((text, i) => ({
      text,
      options: {
        bold: true,
        color: WHITE,
        fill: { color: BRAND },
        fontSize: 9,
        align: align[i] ?? 'left',
        margin: 4,
      },
    }))

  // ── 1. Title ─────────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide()
    slide.background = { color: BRAND_DARK }
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 7.1,
      y: -1.5,
      w: 4.6,
      h: 4.6,
      fill: { color: BRAND_MID },
      line: { color: BRAND_MID, width: 0 },
    })
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 8.35,
      y: 2.9,
      w: 2.9,
      h: 2.9,
      fill: { color: BRAND },
      line: { color: BRAND, width: 0 },
    })
    slide.addText('MANAGEMENT REVIEW', {
      x: 0.7,
      y: 0.72,
      w: 6,
      h: 0.25,
      fontSize: 10,
      bold: true,
      charSpacing: 2.4,
      color: '9FB1CB',
      fontFace: FONT,
    })
    slide.addText('Tasknet', {
      x: 0.7,
      y: 1.02,
      w: 7,
      h: 0.95,
      fontSize: 46,
      bold: true,
      color: WHITE,
      fontFace: FONT,
    })
    slide.addText('One master task manager for every employee', {
      x: 0.7,
      y: 1.98,
      w: 7.2,
      h: 0.4,
      fontSize: 18,
      color: 'C5D1E2',
      fontFace: FONT,
    })
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.72,
      y: 2.56,
      w: 1.5,
      h: 0.045,
      fill: { color: '7189AD' },
      line: { color: '7189AD', width: 0 },
    })
    slide.addText('Adoption, employee experience and the business case', {
      x: 0.7,
      y: 2.76,
      w: 7.4,
      h: 0.34,
      fontSize: 13,
      color: 'DFE6F1',
      fontFace: FONT,
    })
    slide.addText(`Prepared by ${preparedBy} (${preparedByCode})  ·  ${today}`, {
      x: 0.7,
      y: 4.42,
      w: 7,
      h: 0.26,
      fontSize: 9.5,
      color: '9FB1CB',
      fontFace: FONT,
    })
    slide.addText('Confidential - for internal management use', {
      x: 0.7,
      y: 4.72,
      w: 7,
      h: 0.24,
      fontSize: 8.5,
      color: '7189AD',
      fontFace: FONT,
    })

    const stats: [string, string][] = [
      [`${k.activeEmployees}`, 'active employees'],
      [`${k.engagementRate}%`, `active in last ${usage.days} days`],
      [hasSurvey ? `${s.avgOverall}/5` : `${k.adoptedRate}%`, hasSurvey ? 'employee satisfaction' : 'ever used Tasknet'],
      [hasSurvey ? `${s.recommendRate}%` : `${k.tasksCompleted}`, hasSurvey ? 'would recommend' : 'tasks completed'],
    ]
    const cardW = 2.0
    stats.forEach(([value, label], i) => {
      const x = 0.7 + i * (cardW + 0.15)
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 3.35,
        w: cardW,
        h: 0.85,
        rectRadius: 0.05,
        fill: { color: BRAND_MID },
        line: { color: '3B5375', width: 0.75 },
      })
      slide.addText(value, {
        x: x + 0.14,
        y: 3.43,
        w: cardW - 0.28,
        h: 0.36,
        fontSize: 18,
        bold: true,
        color: WHITE,
        fontFace: FONT,
        valign: 'top',
      })
      slide.addText(label, {
        x: x + 0.14,
        y: 3.8,
        w: cardW - 0.28,
        h: 0.3,
        fontSize: 8,
        color: 'C5D1E2',
        fontFace: FONT,
        valign: 'top',
        fit: 'shrink',
      })
    })
  }

  // ── 2. Executive summary ─────────────────────────────────────────────────
  {
    const slide = addSlide('Executive summary', 'The one-slide version')
    const cardW = 1.7
    const gap = 0.125
    const cards: [string, string, string, 'brand' | 'emerald' | 'amber'][] = [
      ['Employees', `${k.activeEmployees}`, 'active accounts', 'brand'],
      ['Adoption', `${k.adoptedRate}%`, `${k.adopted} have used Tasknet`, 'brand'],
      ['Active users', `${k.engagementRate}%`, `${k.activeUsers} in last ${usage.days} days`, 'emerald'],
      [
        'Satisfaction',
        hasSurvey ? `${s.avgOverall}/5` : '-',
        hasSurvey ? plural(s.submitted, 'response') : 'survey in progress',
        hasSurvey ? 'emerald' : 'amber',
      ],
      [
        'Would recommend',
        hasSurvey ? `${s.recommendRate}%` : '-',
        hasSurvey ? `${s.satisfiedRate}% rate us 4-5` : 'survey in progress',
        hasSurvey ? 'emerald' : 'amber',
      ],
    ]
    cards.forEach(([label, value, sub, tone], i) => {
      card(slide, { x: MARGIN + i * (cardW + gap), y: 1.12, w: cardW, h: 1.32, label, value, sub, tone })
    })

    const adoptionLine = `${k.activeUsers} of ${k.activeEmployees} active employees (${k.engagementRate}%) used Tasknet in the last ${usage.days} days, creating ${k.tasksCreated} tasks and completing ${k.tasksCompleted}.`
    const experienceLine = hasSurvey
      ? `${s.submitted} of ${s.eligibleEmployees} employees completed the survey (${s.responseRate}%). Average satisfaction is ${s.avgOverall}/5 and ${s.recommendRate}% would recommend Tasknet to a colleague.`
      : `The one-time employee survey is still open - ${s.pending} of ${s.eligibleEmployees} employees have not responded yet, so sentiment is not measured in this version of the deck.`
    const actionLine = hasSurvey && weakest
      ? `The clearest improvement area is "${weakest.shortLabel}" (${weakest.average}/5) - ${ACTION_BY_QUESTION[weakest.key] ?? 'agree a focused fix with the team.'}`
      : `Next step: get to full survey coverage so the employee voice can sit alongside the usage numbers.`

    bullets(slide, [adoptionLine, experienceLine, actionLine], { x: MARGIN, y: 2.62, w: 5.35, h: 2.4, size: 10.5 })

    callout(slide, {
      x: 6.05,
      y: 2.62,
      w: 3.45,
      h: 2.35,
      title: 'Bottom line',
      body: hasSurvey
        ? `${k.engagementRate}% of employees are actively using Tasknet and employees score it ${s.avgOverall}/5. The tool is being used for real work, and employees want it to stay - the priority now is depth, not a new rollout.`
        : `${k.engagementRate}% of employees are actively using Tasknet. Usage is real; the employee survey will confirm whether the experience matches the adoption.`,
    })
  }

  // ── 3. Why we introduced Tasknet ─────────────────────────────────────────
  {
    const slide = addSlide('Why we introduced Tasknet', 'The problem')
    slide.addText('Work was spread across tools that do not talk to each other', {
      x: MARGIN,
      y: 1.1,
      w: 4.2,
      h: 0.5,
      fontSize: 12,
      bold: true,
      color: BRAND,
      fontFace: FONT,
      fit: 'shrink',
    })
    bullets(
      slide,
      [
        'Task lists lived in spreadsheets, email and chat - there was no single source of truth.',
        'Managers had no live view of who is doing what, what is overdue, or what is blocked.',
        'Recurring work slipped through the cracks; reminders and follow-ups were manual.',
        'Reporting to management meant chasing updates and rebuilding the same spreadsheet every month.',
      ],
      { x: MARGIN, y: 1.62, w: 4.25, h: 2.9, size: 10.5 }
    )
    callout(slide, {
      x: 5.05,
      y: 1.1,
      w: 4.45,
      h: 3.42,
      title: 'What changed with Tasknet',
      body: [
        'One master task list per employee, with owner, due date, priority and validation.',
        '',
        'Managers see workload, overdue items and completion in real time - no status calls needed.',
        '',
        'Recurring tasks roll over automatically and reminders go out by push and email.',
        '',
        'Reports and Excel exports come straight from live data, ready for management review.',
      ].join('\n'),
    })
  }

  // ── 4. Capability -> business outcome ────────────────────────────────────
  {
    const slide = addSlide('What Tasknet delivers for the business', 'Capability to outcome')
    const rows: { text: string; options?: Record<string, unknown> }[][] = [
      headerCells(['Capability', 'What it means for the business'], ['left', 'left']),
      ...[
        ['Single source of truth', 'Fewer status meetings and "where are we?" messages - one place everyone trusts.'],
        ['Assignments and validation', 'Clear ownership and a sign-off step, so accountability does not depend on memory.'],
        ['Recurring tasks and reminders', 'Routine work happens on schedule without anyone re-creating it each cycle.'],
        ['Manager dashboards and reports', 'Live visibility of workload and overdue work; management reporting takes minutes.'],
        ['Mobile app and push alerts', 'Desk and field employees stay reachable and can update work from their phone.'],
        ['Activity log and audit trail', 'Evidence for reviews, audits and performance conversations.'],
      ].map(([capability, outcome]) => [
        { text: capability, options: { bold: true, color: BRAND, fontSize: 9.5 } },
        { text: outcome, options: { fontSize: 9.5 } },
      ]),
    ]
    table(slide, rows, { x: MARGIN, y: 1.15, w: CONTENT_W, colW: [2.75, 6.25], rowH: 0.5, fontSize: 9.5 })
    slide.addText(
      'Every capability below is in production today and covered by the usage figures in this deck.',
      { x: MARGIN, y: 4.72, w: CONTENT_W, h: 0.28, fontSize: 9, italic: true, color: MUTED, fontFace: FONT }
    )
  }

  // ── 5. Adoption at a glance ──────────────────────────────────────────────
  {
    const slide = addSlide('Adoption at a glance', `Last ${usage.days} days`)
    const cw = 2.85
    const ch = 1.45
    const gx = 0.225
    const gy = 0.24
    const items: [string, string, string, 'brand' | 'emerald' | 'amber'][] = [
      ['Active employees', `${k.activeEmployees}`, 'people with a Tasknet account', 'brand'],
      ['Have used Tasknet', `${k.adoptedRate}%`, `${k.adopted} of ${k.activeEmployees} employees`, 'brand'],
      ['Active users', `${k.engagementRate}%`, `${k.activeUsers} used it in the period`, 'emerald'],
      ['Tasks created', `${k.tasksCreated}`, 'new tasks raised in the period', 'brand'],
      ['Tasks completed', `${k.tasksCompleted}`, 'assignments closed in the period', 'emerald'],
      ['Mobile reach', `${k.appRate}%`, `${k.appUsers} app installs · ${k.pushRate}% push enabled`, 'amber'],
    ]
    items.forEach(([label, value, sub, tone], i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      card(slide, { x: MARGIN + col * (cw + gx), y: 1.18 + row * (ch + gy), w: cw, h: ch, label, value, sub, tone })
    })
    slide.addText(
      `Adoption is measured from the task activity log: an employee counts as active if they recorded at least one action between ${shortDate(
        new Date(Date.now() - usage.days * 86400000).toISOString()
      )} and ${today}. Usage covers all active accounts; the survey covers the ${s.eligibleEmployees} non-admin employees.`,
      { x: MARGIN, y: 4.82, w: CONTENT_W, h: 0.3, fontSize: 8, italic: true, color: MUTED, fontFace: FONT, fit: 'shrink' }
    )
  }

  // ── 6. Adoption trend ────────────────────────────────────────────────────
  {
    const slide = addSlide('Adoption is holding as the team grows', 'Six-month trend')
    const labels = usage.adoptionTrend.map((m) => m.label)
    const active = usage.adoptionTrend.map((m) => m.activeUsers)
    const added = usage.adoptionTrend.map((m) => m.newUsers)
    slide.addChart(
      pptx.ChartType.line,
      [
        { name: 'Active users', labels, values: active },
        { name: 'Employees added', labels, values: added },
      ],
      {
        x: MARGIN,
        y: 1.18,
        w: 5.75,
        h: 3.35,
        chartColors: [BRAND, '9FB1CB'],
        lineSize: 2.25,
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 6,
        showLegend: true,
        legendPos: 'b',
        legendFontFace: FONT,
        legendFontSize: 8.5,
        catAxisLabelFontFace: FONT,
        catAxisLabelFontSize: 8.5,
        valAxisLabelFontFace: FONT,
        valAxisLabelFontSize: 8.5,
        valAxisMinVal: 0,
        valGridLine: { style: 'dash', color: LINE },
        catGridLine: { style: 'none' },
        showValue: false,
      }
    )

    const trend = usage.adoptionTrend
    const current = trend[trend.length - 1]
    const completed = trend.slice(0, -1)
    const peak = trend.reduce((a, b) => (b.activeUsers > a.activeUsers ? b : a), trend[0])
    const lastFull = completed[completed.length - 1]
    const trendLine =
      !peak || peak.activeUsers === 0
        ? 'No monthly activity has been recorded in this window yet - the first active month will establish the baseline.'
        : lastFull && lastFull.activeUsers >= peak.activeUsers * 0.9
          ? `Monthly active users peaked at ${peak.activeUsers} in ${peak.label}; the last full month (${lastFull.label}) recorded ${lastFull.activeUsers}. Usage is holding near its peak.`
          : `Monthly active users peaked at ${peak.activeUsers} in ${peak.label}; the last full month (${lastFull?.label ?? '-'}) recorded ${lastFull?.activeUsers ?? 0}. Re-engaging the quieter teams is the opportunity.`
    bullets(
      slide,
      [
        trendLine,
        `${k.newThisPeriod} employees joined the platform in the last ${usage.days} days and are part of the onboarding wave.`,
        `${k.engagementRate}% of active employees touched the tool in the period - it is part of the weekly routine, not a one-off launch spike.`,
      ],
      { x: 6.45, y: 1.3, w: 3.05, h: 3.1, size: 9.5 }
    )
    if (current) {
      slide.addText(`The current month (${current.label}) is still in progress.`, {
        x: MARGIN,
        y: 4.62,
        w: 5.75,
        h: 0.26,
        fontSize: 8,
        italic: true,
        color: MUTED,
        fontFace: FONT,
      })
    }
  }

  // ── 7. Adoption by process ───────────────────────────────────────────────
  {
    const slide = addSlide('Adoption by process', 'Where usage is strongest')
    const top = usage.byProcess.slice(0, 8)
    const rows: { text: string; options?: Record<string, unknown> }[][] = [
      headerCells(['Process', 'Employees', 'Active', 'Tasks', 'Actions'], ['left', 'right', 'right', 'right', 'right']),
      ...top.map((p: ProcessUsageRow) => [
        { text: p.process, options: { bold: true, fontSize: 8.5 } },
        { text: `${p.employees}`, options: { align: 'right' as const, fontSize: 8.5 } },
        { text: `${p.active}`, options: { align: 'right' as const, fontSize: 8.5 } },
        { text: `${p.tasksCreated}`, options: { align: 'right' as const, fontSize: 8.5 } },
        { text: `${p.activities}`, options: { align: 'right' as const, fontSize: 8.5 } },
      ]),
    ]
    table(slide, rows, { x: MARGIN, y: 1.15, w: 6.05, colW: [2.05, 1.05, 0.9, 0.95, 1.1], rowH: 0.34, fontSize: 8.5 })

    const busiest = top[0]
    const quiet = [...usage.byProcess]
      .filter((p) => p.employees >= 2)
      .sort((a, b) => pct(a.active, a.employees) - pct(b.active, b.employees))[0]
    callout(slide, {
      x: 6.75,
      y: 1.15,
      w: 2.75,
      h: 3.4,
      title: busiest ? `${busiest.process} leads` : 'No activity yet',
      body: busiest
        ? `${busiest.process} has ${busiest.employees} employees and ${busiest.activities} recorded actions in the period - the strongest operating rhythm in the company.\n\n${
            quiet && quiet.process !== busiest.process
              ? `Watch ${quiet.process}: ${quiet.active} of ${quiet.employees} employees were active (${pct(quiet.active, quiet.employees)}%). Targeted onboarding there is the quickest adoption win.`
              : 'Every process with more than one employee is active - the rollout is broad as well as deep.'
          }`
        : 'Once employees start recording work, the process breakdown will show where adoption is strongest.',
    })
    slide.addText(
      'Process view counts eligible employees, distinct active users, tasks created and recorded actions in the reporting window.',
      { x: MARGIN, y: 4.55, w: 6.05, h: 0.4, fontSize: 8, italic: true, color: MUTED, fontFace: FONT }
    )
  }

  // ── 8. Employee experience ───────────────────────────────────────────────
  {
    const slide = addSlide('Employees rate Tasknet well', 'One-time feedback survey')
    if (hasSurvey) {
      slide.addChart(
        pptx.ChartType.bar,
        [
          {
            name: 'Average score (out of 5)',
            labels: survey.questions.map((q) => q.shortLabel),
            values: survey.questions.map((q) => q.average),
          },
        ],
        {
          x: MARGIN,
          y: 1.2,
          w: 5.7,
          h: 3.25,
          barDir: 'bar',
          chartColors: [BRAND],
          showValue: true,
          dataLabelColor: WHITE,
          dataLabelFontFace: FONT,
          dataLabelFontSize: 8,
          dataLabelPosition: 'inEnd',
          showLegend: false,
          catAxisLabelFontFace: FONT,
          catAxisLabelFontSize: 8.5,
          valAxisLabelFontFace: FONT,
          valAxisLabelFontSize: 8.5,
          valAxisMinVal: 0,
          valAxisMaxVal: 5,
          valGridLine: { style: 'dash', color: LINE },
          catGridLine: { style: 'none' },
          barGapWidthPct: 45,
        }
      )
      const cw = 2.55
      card(slide, { x: 6.5, y: 1.2, w: cw, h: 1.0, label: 'Responses', value: `${s.submitted}`, sub: `${s.responseRate}% of ${s.eligibleEmployees} employees`, tone: 'brand' })
      card(slide, { x: 6.5, y: 2.32, w: cw, h: 1.0, label: 'Satisfied (4-5 overall)', value: `${s.satisfiedRate}%`, sub: plural(s.satisfiedEmployees, 'employee'), tone: 'emerald' })
      card(slide, { x: 6.5, y: 3.44, w: cw, h: 1.0, label: 'Wrote a comment', value: `${s.commentCount}`, sub: 'responses with written feedback', tone: 'brand' })
      slide.addText(
        'Five statements, rated 1-5 by every employee once. 4-5 counts as a positive response.',
        { x: MARGIN, y: 4.62, w: 5.7, h: 0.3, fontSize: 8, italic: true, color: MUTED, fontFace: FONT }
      )
    } else {
      callout(slide, {
        x: MARGIN,
        y: 1.2,
        w: CONTENT_W,
        h: 1.5,
        title: 'The survey is still open',
        body: `No employee has submitted the one-time survey yet (${s.pending} of ${s.eligibleEmployees} pending). The satisfaction slides fill in automatically as responses arrive - this deck can be regenerated at any time.`,
        tone: 'amber',
      })
      bullets(
        slide,
        [
          'The survey is mandatory on login for employees and can be submitted once.',
          'It covers overall satisfaction, ease of use, staying on top of tasks, notification usefulness and willingness to recommend.',
          'Three optional free-text questions capture what employees like, what to improve, and anything else.',
        ],
        { x: MARGIN, y: 2.9, w: CONTENT_W, h: 1.9, size: 10.5 }
      )
    }
  }

  // ── 9. Strengths and improvement areas ───────────────────────────────────
  {
    const slide = addSlide('Where we score well - and where to improve', 'Score distribution')
    if (hasSurvey) {
      slide.addChart(
        pptx.ChartType.bar,
        survey.questions.map((q, idx) => ({
          name: idx === 0 ? 'Score 1 (low)' : `Score ${idx + 1}`,
          labels: survey.questions.map((x) => x.shortLabel),
          values: survey.questions.map((x) => x.distribution[idx]?.count ?? 0),
        })),
        {
          x: MARGIN,
          y: 1.2,
          w: 6.35,
          h: 3.4,
          barDir: 'bar',
          barGrouping: 'stacked',
          chartColors: DIST_COLORS,
          showLegend: true,
          legendPos: 'b',
          legendFontFace: FONT,
          legendFontSize: 8,
          catAxisLabelFontFace: FONT,
          catAxisLabelFontSize: 8.5,
          valAxisLabelFontFace: FONT,
          valAxisLabelFontSize: 8.5,
          valAxisMinVal: 0,
          valGridLine: { style: 'dash', color: LINE },
          catGridLine: { style: 'none' },
          showValue: false,
          barGapWidthPct: 45,
        }
      )
      const body =
        strongest && weakest
          ? `Strongest: ${strongest.shortLabel} at ${strongest.average}/5 (${strongest.positiveRate}% positive).\n\nWeakest: ${weakest.shortLabel} at ${weakest.average}/5 (${weakest.positiveRate}% positive).\n\nFix: ${ACTION_BY_QUESTION[weakest.key] ?? 'agree a focused improvement with the team.'}`
          : ''
      callout(slide, { x: 7.05, y: 1.2, w: 2.45, h: 3.4, title: 'Read-out', body })
      slide.addText('Each bar is one question; segments are the number of 1-5 ratings.', {
        x: MARGIN,
        y: 4.72,
        w: 6.35,
        h: 0.28,
        fontSize: 8,
        italic: true,
        color: MUTED,
        fontFace: FONT,
      })
    } else {
      callout(slide, {
        x: MARGIN,
        y: 1.2,
        w: CONTENT_W,
        h: 1.4,
        title: 'Awaiting responses',
        body: 'The distribution of scores appears here once employees submit the survey.',
        tone: 'amber',
      })
    }
  }

  // ── 10. In employees' own words ──────────────────────────────────────────
  {
    const slide = addSlide('In employees\u2019 own words', 'What they value')
    const quotes = pickQuotes(
      survey.responses
        .filter((r) => Boolean(r.likedMost?.trim()))
        .map((r) => ({ text: r.likedMost as string, name: r.name, process: r.process, designation: r.designation })),
      4
    )
    if (quotes.length === 0) {
      callout(slide, {
        x: MARGIN,
        y: 1.2,
        w: CONTENT_W,
        h: 1.3,
        title: 'No comments yet',
        body: 'Employees can add optional comments to the survey; their words will appear here as responses come in.',
        tone: 'amber',
      })
    } else {
      const layout =
        quotes.length === 1
          ? [{ x: MARGIN, y: 1.2, w: CONTENT_W, h: 2.55 }]
          : quotes.length === 2
            ? [
                { x: MARGIN, y: 1.2, w: 4.35, h: 3.2 },
                { x: 5.15, y: 1.2, w: 4.35, h: 3.2 },
              ]
            : quotes.length === 3
              ? [
                  { x: MARGIN, y: 1.2, w: 4.35, h: 1.55 },
                  { x: 5.15, y: 1.2, w: 4.35, h: 1.55 },
                  { x: MARGIN, y: 2.95, w: 4.35, h: 1.55 },
                ]
              : [
                  { x: MARGIN, y: 1.12, w: 4.35, h: 1.62 },
                  { x: 5.15, y: 1.12, w: 4.35, h: 1.62 },
                  { x: MARGIN, y: 2.92, w: 4.35, h: 1.62 },
                  { x: 5.15, y: 2.92, w: 4.35, h: 1.62 },
                ]
      const quoteSize = quotes.length === 1 ? 14 : quotes.length === 2 ? 11 : 9.5
      quotes.forEach((q, i) => {
        const p = layout[i]
        slide.addShape(pptx.ShapeType.roundRect, {
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          rectRadius: 0.06,
          fill: { color: BRAND_SOFT },
          line: { color: BRAND_LINE, width: 0.75 },
        })
        slide.addText('\u201C', {
          x: p.x + 0.14,
          y: p.y + 0.04,
          w: 0.4,
          h: 0.4,
          fontSize: 26,
          bold: true,
          color: '9FB1CB',
          fontFace: 'Georgia',
        })
        slide.addText(q.text, {
          x: p.x + 0.42,
          y: p.y + 0.16,
          w: p.w - 0.58,
          h: p.h - 0.62,
          fontSize: quoteSize,
          italic: true,
          color: TEXT,
          fontFace: FONT,
          valign: 'top',
          lineSpacingMultiple: 1.1,
          fit: 'shrink',
        })
        slide.addText(`${q.name} · ${q.designation}`, {
          x: p.x + 0.42,
          y: p.y + p.h - 0.44,
          w: p.w - 0.58,
          h: 0.2,
          fontSize: 8,
          bold: true,
          color: BRAND,
          fontFace: FONT,
          fit: 'shrink',
        })
        slide.addText(q.process, {
          x: p.x + 0.42,
          y: p.y + p.h - 0.26,
          w: p.w - 0.58,
          h: 0.18,
          fontSize: 7.5,
          color: MUTED,
          fontFace: FONT,
        })
      })
    }
  }

  // ── 11. What to improve ──────────────────────────────────────────────────
  {
    const slide = addSlide('What employees want improved', 'The honest feedback')
    const improvementQuotes = pickQuotes(
      survey.responses
        .filter((r) => Boolean(r.improvements?.trim()))
        .map((r) => ({ text: r.improvements as string, name: r.name, process: r.process, designation: r.designation })),
      3
    )
    const otherQuotes = pickQuotes(
      survey.responses
        .filter((r) => Boolean(r.comments?.trim()))
        .map((r) => ({ text: r.comments as string, name: r.name, process: r.process, designation: r.designation })),
      2
    )
    if (improvementQuotes.length === 0 && otherQuotes.length === 0) {
      callout(slide, {
        x: MARGIN,
        y: 1.2,
        w: CONTENT_W,
        h: 1.3,
        title: 'No improvement comments yet',
        body: 'Optional improvement comments will be summarised here. Until then, the score gaps on the previous slide are the best signal.',
        tone: 'amber',
      })
    } else {
      const n = improvementQuotes.length
      const cardW = n === 1 ? CONTENT_W : n === 2 ? 4.4 : 2.9
      improvementQuotes.forEach((q, i) => {
        const x = MARGIN + i * (cardW + 0.15)
        slide.addShape(pptx.ShapeType.roundRect, {
          x,
          y: 1.1,
          w: cardW,
          h: 2.15,
          rectRadius: 0.06,
          fill: { color: WHITE },
          line: { color: 'FDE68A', width: 0.9 },
        })
        slide.addText(q.text, {
          x: x + 0.16,
          y: 1.24,
          w: cardW - 0.32,
          h: 1.42,
          fontSize: n === 1 ? 12 : 9,
          color: TEXT,
          fontFace: FONT,
          valign: 'top',
          lineSpacingMultiple: 1.1,
          fit: 'shrink',
        })
        slide.addText(`${q.name} · ${q.process}`, {
          x: x + 0.16,
          y: 2.82,
          w: cardW - 0.32,
          h: 0.3,
          fontSize: 7.5,
          bold: true,
          color: AMBER,
          fontFace: FONT,
          fit: 'shrink',
        })
      })
      if (otherQuotes.length > 0) {
        const text = otherQuotes.map((q) => `\u201C${q.text}\u201D - ${q.name}, ${q.process}`).join('\n')
        slide.addShape(pptx.ShapeType.roundRect, {
          x: MARGIN,
          y: 3.4,
          w: CONTENT_W,
          h: 1.2,
          rectRadius: 0.06,
          fill: { color: AMBER_SOFT },
          line: { color: 'FDE68A', width: 0.75 },
        })
        slide.addText('Also mentioned', {
          x: MARGIN + 0.16,
          y: 3.48,
          w: 3,
          h: 0.22,
          fontSize: 8.5,
          bold: true,
          color: AMBER,
          fontFace: FONT,
        })
        slide.addText(text, {
          x: MARGIN + 0.16,
          y: 3.72,
          w: CONTENT_W - 0.32,
          h: 0.78,
          fontSize: 8.5,
          italic: true,
          color: TEXT,
          fontFace: FONT,
          valign: 'top',
          fit: 'shrink',
        })
      }
    }
  }

  // ── 12. Business impact ──────────────────────────────────────────────────
  {
    const slide = addSlide('What this means commercially', 'Business impact')
    const rows: { text: string; options?: Record<string, unknown> }[][] = [
      headerCells(['Value lever', 'Evidence from the data', 'Management takeaway'], ['left', 'left', 'left']),
      ...[
        [
          'Daily adoption',
          `${k.engagementRate}% of active employees used Tasknet in the last ${usage.days} days (${k.activeUsers} people).`,
          'The tool is embedded in daily work - this is not shelfware.',
        ],
        [
          'Work throughput',
          `${k.tasksCreated} tasks created and ${k.tasksCompleted} completed in the period, all in one system.`,
          'Work is visible end-to-end; bottlenecks can be spotted while there is still time to act.',
        ],
        [
          'Mobile reach',
          `${k.appRate}% of employees have the app; ${k.pushRate}% have push notifications enabled.`,
          'Field and desk teams can be reached and can update work without opening a laptop.',
        ],
        [
          'Employee sentiment',
          hasSurvey
            ? `${s.avgOverall}/5 average satisfaction; ${s.recommendRate}% would recommend Tasknet (${plural(s.submitted, 'response')}).`
            : `Survey in progress - ${s.pending} employees still to respond.`,
          hasSurvey ? 'Employees see the value, which lowers the change-management cost of expanding it.' : 'Complete the survey to quantify sentiment before wider rollout.',
        ],
        [
          'Management visibility',
          'Live dashboards, process breakdowns, Excel exports and this deck are generated from the same data.',
          'Reporting no longer needs manual collation - reviews can run on current numbers.',
        ],
      ].map(([lever, evidence, takeaway]) => [
        { text: lever, options: { bold: true, color: BRAND, fontSize: 9 } },
        { text: evidence, options: { fontSize: 9 } },
        { text: takeaway, options: { fontSize: 9, color: SLATE } },
      ]),
    ]
    table(slide, rows, { x: MARGIN, y: 1.15, w: CONTENT_W, colW: [1.75, 3.5, 3.75], rowH: 0.56, fontSize: 9 })
    slide.addText('All figures are measured from Tasknet; no estimated time savings are included.', {
      x: MARGIN,
      y: 4.88,
      w: CONTENT_W,
      h: 0.26,
      fontSize: 8,
      italic: true,
      color: MUTED,
      fontFace: FONT,
    })
  }

  // ── 13. Recommendations ──────────────────────────────────────────────────
  {
    const slide = addSlide('Recommendations and next steps', 'What we propose')
    const now: string[] = []
    const next: string[] = []
    const later: string[] = []

    if (s.pending > 0) {
      now.push(`Close the survey loop: follow up with the ${s.pending} employees who have not responded so sentiment is complete.`)
    } else if (s.eligibleEmployees > 0) {
      now.push('Survey coverage is complete - publish the results back to employees so they see their feedback acted on.')
    }
    if (hasSurvey && weakest) {
      now.push(`Fix "${weakest.shortLabel}" (${weakest.average}/5): ${ACTION_BY_QUESTION[weakest.key] ?? 'agree a focused improvement.'}`)
    }
    if (k.pushRate < 90) {
      now.push(`Increase push coverage from ${k.pushRate}% so reminders and due-date alerts actually reach people.`)
    } else {
      now.push('Keep reminder settings under review so alerts stay useful and do not become noise.')
    }

    if (k.appRate < 100) {
      next.push(`Drive app installs from ${k.appRate}% towards 100% - the app is how field employees update work on time.`)
    } else {
      next.push('Maintain 100% app coverage as new employees join; include it in onboarding.')
    }
    const quiet = [...usage.byProcess].filter((p) => p.employees >= 2).sort((a, b) => pct(a.active, a.employees) - pct(b.active, b.employees))[0]
    if (quiet && pct(quiet.active, quiet.employees) < 80) {
      next.push(`Run a targeted onboarding for ${quiet.process} (${pct(quiet.active, quiet.employees)}% active) and review its task hygiene.`)
    } else {
      next.push('Share the working practices of the strongest process as the internal standard.')
    }
    if (k.adoptedRate < 100) {
      next.push(`Activate the ${k.activeEmployees - k.adopted} employees who have never recorded work in Tasknet.`)
    }

    later.push('Re-run this survey in six months to measure movement on the same five questions.')
    later.push('Extend the management pack with quarterly targets per process, using the same live data.')
    later.push('Use the activity log in performance and audit reviews instead of reconstructing history manually.')

    const cols: [string, string[], string][] = [
      ['Now · 0-30 days', now, BRAND],
      ['Next · 30-60 days', next, '4A658C'],
      ['Then · 60-90 days', later, '7189AD'],
    ]
    cols.forEach(([title, items, accent], i) => {
      const x = MARGIN + i * 3.05
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.12,
        w: 2.85,
        h: 3.55,
        rectRadius: 0.06,
        fill: { color: WHITE },
        line: { color: LINE, width: 0.75 },
      })
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.12,
        w: 2.85,
        h: 0.38,
        rectRadius: 0.06,
        fill: { color: accent },
        line: { color: accent, width: 0 },
      })
      slide.addText(title, {
        x: x + 0.14,
        y: 1.17,
        w: 2.57,
        h: 0.28,
        fontSize: 9.5,
        bold: true,
        color: WHITE,
        fontFace: FONT,
      })
      slide.addText(
        items.map((text) => ({ text, options: { bullet: { code: '2022' }, breakLine: true } })),
        {
          x: x + 0.14,
          y: 1.62,
          w: 2.57,
          h: 2.95,
          fontSize: 8.5,
          color: TEXT,
          fontFace: FONT,
          valign: 'top',
          lineSpacingMultiple: 1.14,
          paraSpaceAfter: 6,
          fit: 'shrink',
        }
      )
    })
  }

  // ── 14. Appendix ─────────────────────────────────────────────────────────
  {
    const slide = addSlide('How these numbers were produced', 'Appendix')
    const rows: { text: string; options?: Record<string, unknown> }[][] = [
      headerCells(['Measure', 'Definition'], ['left', 'left']),
      ...[
        ['Active employees', 'All accounts with an active login, including the administrator account. The survey population excludes ADMIN accounts.'],
        ['Adoption rate', 'Share of active employees who have ever recorded a task action (created, updated, commented, validated, etc.).'],
        ['Active users', 'Employees who recorded at least one task action inside the reporting window.'],
        ['Tasks created / completed', 'Tasks raised in the window and task assignments completed in the window.'],
        ['Mobile reach', 'Share of active employees with a registered app install / push subscription.'],
        ['Survey', 'One-time, mandatory, employees only. Five ratings on a 1-5 scale plus three optional comments; one submission per employee.'],
        ['Positive rating', 'A rating of 4 or 5. "Satisfied" uses the overall satisfaction question.'],
      ].map(([measure, definition]) => [
        { text: measure, options: { bold: true, color: BRAND, fontSize: 8.5 } },
        { text: definition, options: { fontSize: 8.5, color: TEXT } },
      ]),
    ]
    table(slide, rows, { x: MARGIN, y: 1.1, w: CONTENT_W, colW: [1.75, 7.25], rowH: 0.44, fontSize: 8.5 })
    slide.addText(
      `Reporting window: last ${usage.days} days (${shortDate(
        new Date(Date.now() - usage.days * 86400000).toISOString()
      )} to ${today})  ·  Generated ${today} by ${preparedBy} (${preparedByCode})  ·  Source: Tasknet live data`,
      { x: MARGIN, y: 4.62, w: CONTENT_W, h: 0.45, fontSize: 8, italic: true, color: MUTED, fontFace: FONT, fit: 'shrink' }
    )
  }

  const output = await pptx.write({ outputType: 'nodebuffer' })
  return output as Buffer
}
