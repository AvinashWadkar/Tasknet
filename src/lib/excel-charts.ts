import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { parse as parseFont } from 'opentype.js'
import type {
  EmployeeStat,
  GroupStat,
  MonthPoint,
  StatusSlice,
} from '@/lib/reports'

/**
 * Server-side chart rendering for the Excel report export.
 * Each chart is drawn as an SVG string and rasterized to a PNG buffer with
 * sharp (native, works in serverless/standalone). ExcelJS embeds these PNGs
 * into a "Charts" worksheet.
 */

// ── Palette (mirrors the Reports UI / brand) ──────────────────────────────
export const CHART_COLORS = {
  brandDark: '#1e3050',
  brandMid: '#2e4566',
  brandLight: '#9fb1cb',
  slate: '#475569',
  slateLight: '#94a3b8',
  grid: '#e2e8f0',
  emerald: '#059669',
  amber: '#f59e0b',
  red: '#dc2626',
  violet: '#7c3aed',
} as const

export interface ChartImage {
  key: string
  title: string
  buffer: Buffer
  width: number
  height: number
}

interface Slice {
  label: string
  value: number
  color: string
}

type Font = ReturnType<typeof parseFont>

let _font: Font | null = null
function getFont(): Font {
  if (!_font) {
    const file = path.join(process.cwd(), 'src', 'lib', 'fonts', 'NotoSans-Regular.ttf')
    _font = parseFont(fs.readFileSync(file))
  }
  return _font
}

type TextAnchor = 'start' | 'middle' | 'end'

/** Replace glyphs the bundled font can't render so they never become boxes. */
function sanitize(str: string): string {
  const f = getFont()
  let out = ''
  for (const ch of str) {
    if (ch === '\n' || ch === '\r' || ch === '\t') {
      out += ' '
    } else {
      out += f.charToGlyph(ch).index === 0 ? '?' : ch
    }
  }
  return out
}

/** Width of a label in SVG user units at the given font size. */
function textWidth(str: string, size: number): number {
  return getFont().getAdvanceWidth(sanitize(str), size, { kerning: true })
}

/**
 * Render a text label as an SVG <path>. Sharp's librsvg has no working font
 * backend on many hosts (notably Windows), so <text> rasterizes into tofu
 * boxes. Drawing the glyph outlines from a bundled font removes any dependency
 * on system fonts. `bold` is faked with a light stroke since only the regular
 * weight is bundled.
 */
function text(
  x: number,
  y: number,
  str: string | number,
  opts: { size?: number; color?: string; anchor?: TextAnchor; bold?: boolean } = {}
): string {
  const size = opts.size ?? 12
  const color = opts.color ?? CHART_COLORS.slate
  const anchor = opts.anchor ?? 'start'
  const value = sanitize(String(str))
  let startX = x
  if (anchor !== 'start') {
    const w = textWidth(value, size)
    startX = anchor === 'middle' ? x - w / 2 : x - w
  }
  const d = getFont().getPath(value, startX, y, size, { kerning: true }).toPathData(2)
  const stroke = opts.bold ? ` stroke="${color}" stroke-width="${(size * 0.04).toFixed(2)}"` : ''
  return `<path d="${d}" fill="${color}"${stroke}/>`
}

const svgDoc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="${w}" height="${h}" fill="#ffffff"/>` +
  body +
  '</svg>'

/** A donut ring segment path from a1..a2 (radians, clockwise from top). */
function ringPath(cx: number, cy: number, outer: number, inner: number, a1: number, a2: number): string {
  const large = a2 - a1 > Math.PI ? 1 : 0
  const o1 = [cx + outer * Math.cos(a1), cy + outer * Math.sin(a1)]
  const o2 = [cx + outer * Math.cos(a2), cy + outer * Math.sin(a2)]
  const i2 = [cx + inner * Math.cos(a2), cy + inner * Math.sin(a2)]
  const i1 = [cx + inner * Math.cos(a1), cy + inner * Math.sin(a1)]
  return (
    `M ${o1[0].toFixed(2)} ${o1[1].toFixed(2)} ` +
    `A ${outer} ${outer} 0 ${large} 1 ${o2[0].toFixed(2)} ${o2[1].toFixed(2)} ` +
    `L ${i2[0].toFixed(2)} ${i2[1].toFixed(2)} ` +
    `A ${inner} ${inner} 0 ${large} 0 ${i1[0].toFixed(2)} ${i1[1].toFixed(2)} Z`
  )
}

function donutSvg(slices: Slice[], title: string): string {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const W = 480
  const H = 300
  const cx = 140
  const cy = 150
  const outer = 96
  const inner = 62
  const legendX = 270

  const parts: string[] = []
  parts.push(
    text(W / 2, 26, title, { size: 15, color: CHART_COLORS.brandDark, anchor: 'middle', bold: true })
  )

  if (total === 0) {
    parts.push(text(cx, cy - 8, 'No data', { size: 13, color: CHART_COLORS.slateLight, anchor: 'middle' }))
  } else {
    let angle = -Math.PI / 2
    for (const s of slices) {
      if (s.value <= 0) continue
      const a2 = angle + (s.value / total) * Math.PI * 2
      parts.push(
        `<path d="${ringPath(cx, cy, outer, inner, angle, a2)}" fill="${s.color}"/>`
      )
      angle = a2
    }
    parts.push(
      text(cx, cy - 2, total, { size: 26, color: CHART_COLORS.brandDark, anchor: 'middle', bold: true }),
      text(cx, cy + 18, 'assignments', { size: 10, color: CHART_COLORS.slateLight, anchor: 'middle' })
    )
  }

  // Legend
  const legendRows: string[] = []
  slices.forEach((s, i) => {
    const ly = 30 + i * 34
    legendRows.push(
      `<rect x="${legendX}" y="${ly - 10}" width="12" height="12" rx="3" fill="${s.color}"/>`,
      text(legendX + 20, ly, s.label, { size: 12, color: CHART_COLORS.slate }),
      text(
        legendX + 196,
        ly,
        `${s.value}${total ? ` (${Math.round((s.value / total) * 100)}%)` : ''}`,
        { size: 12, color: CHART_COLORS.brandDark, anchor: 'end', bold: true }
      )
    )
  })
  parts.push(...legendRows)

  return svgDoc(W, H, parts.join(''))
}

/** Map a value to an SVG point on a line-chart plot area. */
function makeScale(values: number[], w: number, h: number) {
  const max = Math.max(1, ...values)
  const pad = Math.ceil(max * 0.1)
  const top = max + pad
  return (v: number) => (v / top) * h
}

function trendSvg(points: MonthPoint[], title: string): string {
  const W = 620
  const H = 300
  const mL = 44
  const mR = 12
  const mT = 34
  const mB = 28
  const cw = W - mL - mR
  const ch = H - mT - mB

  const parts: string[] = []
  parts.push(
    text(W / 2, 26, title, { size: 15, color: CHART_COLORS.brandDark, anchor: 'middle', bold: true })
  )

  if (points.length === 0) {
    parts.push(
      text((mL + W - mR) / 2, mT + ch / 2, 'No data', {
        size: 13,
        color: CHART_COLORS.slateLight,
        anchor: 'middle',
      })
    )
    return svgDoc(W, H, parts.join(''))
  }

  const dueMax = Math.max(1, ...points.map((p) => Math.max(p.due, p.completed, p.late)))
  const yScale = makeScale([dueMax * 1.05], ch, ch)
  const xStep = cw / Math.max(1, points.length - 1)

  const xOf = (i: number) => mL + i * xStep
  const yOf = (v: number) => mT + ch - yScale(v)

  // Gridlines + y labels
  const ticks = 4
  for (let t = 0; t <= ticks; t++) {
    const y = mT + (ch / ticks) * t
    const val = Math.round((dueMax * (ticks - t)) / ticks)
    parts.push(
      `<line x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}" stroke="${CHART_COLORS.grid}" stroke-width="1"/>`,
      text(mL - 6, y + 4, val, { size: 10.5, color: CHART_COLORS.slateLight, anchor: 'end' })
    )
  }

  // X labels
  points.forEach((p, i) => {
    parts.push(
      text(xOf(i), H - 8, p.label, { size: 10.5, color: CHART_COLORS.slateLight, anchor: 'middle' })
    )
  })

  // Axes
  parts.push(
    `<line x1="${mL}" y1="${mT}" x2="${mL}" y2="${mT + ch}" stroke="${CHART_COLORS.slateLight}" stroke-width="1"/>`,
    `<line x1="${mL}" y1="${mT + ch}" x2="${W - mR}" y2="${mT + ch}" stroke="${CHART_COLORS.slateLight}" stroke-width="1"/>`
  )

  const pathOf = (key: 'due' | 'completed' | 'late', pad = 0) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(p[key]) + pad}`).join(' ')

  // Area under "due"
  const areaD =
    `M ${xOf(0)} ${mT + ch} ` +
    points.map((p, i) => `L ${xOf(i)} ${yOf(p.due)}`).join(' ') +
    ` L ${xOf(points.length - 1)} ${mT + ch} Z`
  parts.push(`<path d="${areaD}" fill="#dfe6f1" opacity="0.55"/>`)

  // Series lines
  parts.push(
    `<path d="${pathOf('due')}" fill="none" stroke="${CHART_COLORS.brandMid}" stroke-width="2.4"/>`,
    `<path d="${pathOf('completed')}" fill="none" stroke="${CHART_COLORS.emerald}" stroke-width="2.8"/>`,
    `<path d="${pathOf('late')}" fill="none" stroke="${CHART_COLORS.amber}" stroke-width="2" stroke-dasharray="7 5"/>`
  )

  // Dots
  points.forEach((p, i) => {
    parts.push(
      `<circle cx="${xOf(i)}" cy="${yOf(p.completed)}" r="3.4" fill="${CHART_COLORS.emerald}"/>`
    )
  })

  // Legend
  const legend: [string, string, boolean][] = [
    ['Assigned (due)', CHART_COLORS.brandMid, false],
    ['Completed', CHART_COLORS.emerald, false],
    ['Completed late', CHART_COLORS.amber, true],
  ]
  let lx = mL
  for (const [label, color, dashed] of legend) {
    const labelW = textWidth(label, 11)
    parts.push(
      dashed
        ? `<line x1="${lx}" y1="20" x2="${lx + 18}" y2="20" stroke="${color}" stroke-width="2.6" stroke-dasharray="5 3"/>`
        : `<line x1="${lx}" y1="20" x2="${lx + 18}" y2="20" stroke="${color}" stroke-width="2.6"/>`,
      text(lx + 24, 23.5, label, { size: 11, color: CHART_COLORS.slate })
    )
    lx += 18 + labelW + 22
  }

  return svgDoc(W, H, parts.join(''))
}

function horizontalStackedBarsSvg(
  rows: { label: string; series: { name: string; value: number; color: string }[]; max: number }[],
  legend: { name: string; color: string }[],
  title: string
): string {
  const rowH = 30
  const W = 640
  const labelCol = 152
  const mL = labelCol
  const mR = 14
  const mT = 58
  const mB = 10
  const plotW = W - mL - mR
  const H = mT + mB + rows.length * rowH

  const maxTotal = Math.max(1, ...rows.map((r) => r.max))
  const barH = 14

  const parts: string[] = []
  parts.push(
    text(W / 2, 24, title, { size: 15, color: CHART_COLORS.brandDark, anchor: 'middle', bold: true })
  )

  if (rows.length === 0) {
    parts.push(
      text(W / 2, H / 2, 'No data', { size: 13, color: CHART_COLORS.slateLight, anchor: 'middle' })
    )
    return svgDoc(W, H, parts.join(''))
  }

  // Grid vertical lines (light)
  const vTicks = 4
  for (let t = 0; t <= vTicks; t++) {
    const x = mL + (plotW / vTicks) * t
    parts.push(
      `<line x1="${x}" y1="${mT - 4}" x2="${x}" y2="${H - mB}" stroke="${CHART_COLORS.grid}" stroke-width="1"/>`,
      text(x, H - mB + 4, Math.round((maxTotal * t) / vTicks), {
        size: 9.5,
        color: CHART_COLORS.slateLight,
        anchor: 'middle',
      })
    )
  }

  rows.forEach((r, i) => {
    const y = mT + i * rowH
    const labelY = y + barH / 2 + 4
    let accX = 0
    const segs: string[] = []
    r.series.forEach((s) => {
      if (s.value <= 0) return
      const w = (s.value / maxTotal) * plotW
      const x = mL + accX
      segs.push(`<rect x="${x}" y="${y}" width="${Math.max(1.2, w - 1)}" height="${barH}" rx="2" fill="${s.color}"/>`)
      accX += w
    })
    parts.push(
      text(mL - 8, labelY, r.label, {
        size: 10.5,
        color: CHART_COLORS.slate,
        anchor: 'end',
        bold: true,
      }),
      ...segs
    )
  })

  // Legend
  let lx = mL
  for (const l of legend) {
    const w = textWidth(l.name, 11)
    parts.push(
      `<rect x="${lx}" y="38" width="12" height="12" rx="2.5" fill="${l.color}"/>`,
      text(lx + 16, 47.5, l.name, { size: 11, color: CHART_COLORS.slate })
    )
    lx += 16 + w + 20
  }

  return svgDoc(W, H, parts.join(''))
}

function leaderboardSvg(rows: { name: string; rate: number; done: number; total: number; overdue: number }[], title: string): string {
  const rowH = 40
  const W = 560
  const mL = 40
  const mR = 16
  const mT = 56
  const mB = 8
  const plotW = W - mL - mR
  const H = mT + mB + rows.length * rowH

  const parts: string[] = []
  parts.push(
    text(W / 2, 24, title, { size: 15, color: CHART_COLORS.brandDark, anchor: 'middle', bold: true })
  )

  if (rows.length === 0) {
    parts.push(
      text(W / 2, H / 2, 'No data', { size: 13, color: CHART_COLORS.slateLight, anchor: 'middle' })
    )
    return svgDoc(W, H, parts.join(''))
  }

  rows.forEach((r, i) => {
    const y = mT + i * rowH
    const barY = y + 20
    const barH = 12
    const color = r.rate >= 75 ? CHART_COLORS.emerald : r.rate >= 40 ? CHART_COLORS.brandMid : CHART_COLORS.amber
    parts.push(
      `<circle cx="16" cy="${y + 26}" r="9" fill="#eef2f7"/>`,
      text(16, y + 29, i + 1, { size: 10.5, color: CHART_COLORS.slate, anchor: 'middle', bold: true }),
      text(mL, y + 14, r.name, { size: 11.5, color: CHART_COLORS.brandDark, bold: true }),
      text(
        mL,
        y + 34,
        `${r.done}/${r.total} done${r.overdue > 0 ? ' · ' + r.overdue + ' overdue' : ' · nothing overdue'}`,
        { size: 9.5, color: CHART_COLORS.slateLight }
      ),
      `<rect x="${mL}" y="${barY}" width="${plotW}" height="${barH}" rx="${barH / 2}" fill="${CHART_COLORS.grid}"/>`,
      `<rect x="${mL}" y="${barY}" width="${Math.max(1.5, (r.rate / 100) * plotW)}" height="${barH}" rx="${barH / 2}" fill="${color}"/>`,
      text(mL + plotW, barY + barH - 2, `${r.rate}%`, {
        size: 12,
        color: CHART_COLORS.brandDark,
        anchor: 'end',
        bold: true,
      })
    )
  })

  return svgDoc(W, H, parts.join(''))
}

function verticalStackedBarsSvg(
  rows: { label: string; series: { name: string; value: number; color: string }[] }[],
  legend: { name: string; color: string }[],
  title: string
): string {
  const W = 560
  const H = 300
  const mL = 42
  const mR = 12
  const mT = 56
  const mB = 30
  const cw = W - mL - mR
  const ch = H - mT - mB

  const parts: string[] = []
  parts.push(
    text(W / 2, 24, title, { size: 15, color: CHART_COLORS.brandDark, anchor: 'middle', bold: true })
  )

  if (rows.length === 0) {
    parts.push(
      text(W / 2, mT + ch / 2, 'No data', {
        size: 13,
        color: CHART_COLORS.slateLight,
        anchor: 'middle',
      })
    )
    return svgDoc(W, H, parts.join(''))
  }

  const maxTotal = Math.max(1, ...rows.map((r) => r.series.reduce((s, x) => s + x.value, 0)))
  const groupW = cw / rows.length
  const barW = Math.min(56, groupW * 0.55)
  const ticks = 4

  for (let t = 0; t <= ticks; t++) {
    const y = mT + (ch / ticks) * t
    const val = Math.round((maxTotal * (ticks - t)) / ticks)
    parts.push(
      `<line x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}" stroke="${CHART_COLORS.grid}" stroke-width="1"/>`,
      text(mL - 6, y + 4, val, { size: 10.5, color: CHART_COLORS.slateLight, anchor: 'end' })
    )
  }
  parts.push(
    `<line x1="${mL}" y1="${mT}" x2="${mL}" y2="${mT + ch}" stroke="${CHART_COLORS.slateLight}" stroke-width="1"/>`,
    `<line x1="${mL}" y1="${mT + ch}" x2="${W - mR}" y2="${mT + ch}" stroke="${CHART_COLORS.slateLight}" stroke-width="1"/>`
  )

  rows.forEach((r, i) => {
    const gx = mL + i * groupW + (groupW - barW) / 2
    let accY = 0
    for (const s of r.series) {
      if (s.value <= 0) continue
      const h = (s.value / maxTotal) * ch
      parts.push(
        `<rect x="${gx}" y="${mT + ch - accY - h}" width="${barW}" height="${Math.max(1.2, h - 1)}" fill="${s.color}"/>`
      )
      accY += h
    }
    let label = r.label
    const maxChars = Math.floor(barW / 6.2)
    if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…'
    const labelCx = gx + barW / 2
    const labelCy = H - 10
    parts.push(
      `<g transform="rotate(-16 ${labelCx} ${labelCy})">${text(labelCx, labelCy, label, {
        size: 10,
        color: CHART_COLORS.slate,
        anchor: 'middle',
      })}</g>`
    )
  })

  let lx = mL
  for (const l of legend) {
    const w = textWidth(l.name, 11)
    parts.push(
      `<rect x="${lx}" y="40" width="12" height="12" rx="2.5" fill="${l.color}"/>`,
      text(lx + 16, 49.5, l.name, { size: 11, color: CHART_COLORS.slate })
    )
    lx += 16 + w + 20
  }

  return svgDoc(W, H, parts.join(''))
}

/** Rasterize one SVG document to a PNG buffer. */
async function svgToPng(svg: string): Promise<Buffer> {
  const png = await sharp(Buffer.from(svg)).png()
  return png.toBuffer()
}

/**
 * Build the chart images for a report export.
 * @param report computed report aggregates (same shape the UI uses)
 */
export async function buildChartImages(report: {
  statusMix: StatusSlice[]
  monthly: MonthPoint[]
  byEmployee: EmployeeStat[]
  byProcess: GroupStat[]
  byDesignation: GroupStat[]
}): Promise<ChartImage[]> {
  const images: ChartImage[] = []

  const statusSlices = report.statusMix
    .filter((s) => s.value > 0)
    .map((s) => ({ label: s.label, value: s.value, color: s.color }))
  const donutSvgStr = donutSvg(statusSlices, 'Status mix')
  images.push({
    key: 'status',
    title: 'Status mix — all filtered assignments',
    buffer: await svgToPng(donutSvgStr),
    width: 480,
    height: 300,
  })

  const trendSvgStr = trendSvg(report.monthly, 'Monthly trend — assignments due vs completions')
  images.push({
    key: 'trend',
    title: 'Monthly trend',
    buffer: await svgToPng(trendSvgStr),
    width: 620,
    height: 300,
  })

  const empLegend = [
    { name: 'On time', color: CHART_COLORS.emerald },
    { name: 'Late', color: CHART_COLORS.amber },
    { name: 'Overdue', color: CHART_COLORS.red },
    { name: 'In progress', color: CHART_COLORS.violet },
    { name: 'Pending', color: CHART_COLORS.brandLight },
  ]
  const empRows = report.byEmployee.map((e) => ({
    label: `${e.name} (${e.employeeCode})`,
    max: e.total,
    series: [
      { name: 'On time', value: e.onTime, color: CHART_COLORS.emerald },
      { name: 'Late', value: e.late, color: CHART_COLORS.amber },
      { name: 'Overdue', value: e.overdue, color: CHART_COLORS.red },
      { name: 'In progress', value: e.inProgress, color: CHART_COLORS.violet },
      { name: 'Pending', value: e.pending, color: CHART_COLORS.brandLight },
    ],
  }))
  const empBarSvg = horizontalStackedBarsSvg(empRows, empLegend, 'Outcome by employee')
  const empH = 58 + 10 + empRows.length * 30
  images.push({
    key: 'employees',
    title: 'Outcome by employee — stacked by status',
    buffer: await svgToPng(empBarSvg),
    width: 640,
    height: empH,
  })

  const lbRows = [...report.byEmployee]
    .sort((a, b) => b.completionRate - a.completionRate || b.completed - a.completed)
    .map((e) => ({
      name: `${e.name} (${e.employeeCode})`,
      rate: e.completionRate,
      done: e.completed,
      total: e.total - e.aborted,
      overdue: e.overdue,
    }))
  const lbSvg = leaderboardSvg(lbRows, 'Completion leaderboard')
  const lbH = 56 + 8 + lbRows.length * 40
  images.push({
    key: 'leaderboard',
    title: 'Completion leaderboard',
    buffer: await svgToPng(lbSvg),
    width: 560,
    height: lbH,
  })

  const groupLegend = [
    { name: 'Completed', color: CHART_COLORS.emerald },
    { name: 'Overdue', color: CHART_COLORS.red },
    { name: 'Open (on track)', color: CHART_COLORS.brandLight },
  ]
  const toGroupRows = (g: GroupStat[]) =>
    g.map((x) => ({
      label: x.key,
      series: [
        { name: 'Completed', value: x.completed, color: CHART_COLORS.emerald },
        { name: 'Overdue', value: x.overdue, color: CHART_COLORS.red },
        { name: 'Open', value: x.open, color: CHART_COLORS.brandLight },
      ],
    }))
  const procSvg = verticalStackedBarsSvg(toGroupRows(report.byProcess), groupLegend, 'Performance by process')
  images.push({
    key: 'byProcess',
    title: 'Performance by process',
    buffer: await svgToPng(procSvg),
    width: 560,
    height: 300,
  })

  const desigSvg = verticalStackedBarsSvg(toGroupRows(report.byDesignation), groupLegend, 'Performance by designation')
  images.push({
    key: 'byDesignation',
    title: 'Performance by designation',
    buffer: await svgToPng(desigSvg),
    width: 560,
    height: 300,
  })

  return images
}

/** Bar (new sign-ups) + line (active users) trend used by the usage report. */
function usageTrendSvg(points: { label: string; newUsers: number; activeUsers: number }[], title: string): string {
  const W = 620
  const H = 300
  const mL = 44
  const mR = 12
  const mT = 34
  const mB = 28
  const cw = W - mL - mR
  const ch = H - mT - mB

  const parts: string[] = []
  parts.push(text(W / 2, 26, title, { size: 15, color: CHART_COLORS.brandDark, anchor: 'middle', bold: true }))

  if (points.length === 0) {
    parts.push(text(W / 2, H / 2, 'No data', { size: 13, color: CHART_COLORS.slateLight, anchor: 'middle' }))
    return svgDoc(W, H, parts.join(''))
  }

  const maxVal = Math.max(1, ...points.flatMap((p) => [p.newUsers, p.activeUsers]))
  const top = maxVal + Math.ceil(maxVal * 0.1)
  const yOf = (v: number) => mT + ch - (v / top) * ch
  const xCenter = (i: number) => mL + (cw / points.length) * (i + 0.5)

  const ticks = 4
  for (let t = 0; t <= ticks; t++) {
    const y = mT + (ch / ticks) * t
    parts.push(
      `<line x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}" stroke="${CHART_COLORS.grid}" stroke-width="1"/>`,
      text(mL - 6, y + 4, Math.round((top * (ticks - t)) / ticks), { size: 10.5, color: CHART_COLORS.slateLight, anchor: 'end' })
    )
  }
  parts.push(
    `<line x1="${mL}" y1="${mT}" x2="${mL}" y2="${mT + ch}" stroke="${CHART_COLORS.slateLight}" stroke-width="1"/>`,
    `<line x1="${mL}" y1="${mT + ch}" x2="${W - mR}" y2="${mT + ch}" stroke="${CHART_COLORS.slateLight}" stroke-width="1"/>`
  )

  const barW = Math.min(46, (cw / points.length) * 0.5)
  points.forEach((p, i) => {
    const x = xCenter(i)
    const h = (p.newUsers / top) * ch
    parts.push(`<rect x="${x - barW / 2}" y="${mT + ch - h}" width="${barW}" height="${Math.max(1, h)}" rx="3" fill="${CHART_COLORS.brandLight}"/>`)
    parts.push(text(x, H - 8, p.label, { size: 10, color: CHART_COLORS.slateLight, anchor: 'middle' }))
  })

  parts.push(`<path d="${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i)} ${yOf(p.activeUsers)}`).join(' ')}" fill="none" stroke="${CHART_COLORS.emerald}" stroke-width="2.8"/>`)
  points.forEach((p, i) => {
    parts.push(`<circle cx="${xCenter(i)}" cy="${yOf(p.activeUsers)}" r="3.4" fill="${CHART_COLORS.emerald}"/>`)
  })

  const legend: [string, string, boolean][] = [
    ['New sign-ups', CHART_COLORS.brandLight, false],
    ['Active users', CHART_COLORS.emerald, false],
  ]
  let lx = mL
  for (const [label, color, dashed] of legend) {
    const labelW = textWidth(label, 11)
    parts.push(
      dashed
        ? `<line x1="${lx}" y1="20" x2="${lx + 18}" y2="20" stroke="${color}" stroke-width="2.6" stroke-dasharray="5 3"/>`
        : `<rect x="${lx}" y="14" width="14" height="11" rx="2" fill="${color}"/>`,
      text(lx + 22, 24, label, { size: 11, color: CHART_COLORS.slate })
    )
    lx += 22 + labelW + 22
  }

  return svgDoc(W, H, parts.join(''))
}

/**
 * Build chart images for the admin Tool Adoption & Usage export.
 */
export async function buildUsageChartImages(usage: {
  adoptionTrend: { label: string; newUsers: number; activeUsers: number }[]
  featureUsage: { label: string; count: number }[]
  byProcess: { process: string; employees: number; adopted: number; active: number }[]
}): Promise<ChartImage[]> {
  const images: ChartImage[] = []

  images.push({
    key: 'usageTrend',
    title: 'Adoption & activity trend',
    buffer: await svgToPng(usageTrendSvg(usage.adoptionTrend, 'Adoption & activity — new sign-ups vs active users')),
    width: 620,
    height: 300,
  })

  const featMax = Math.max(1, ...usage.featureUsage.map((f) => f.count))
  const featRows = usage.featureUsage.map((f) => ({
    label: f.label,
    max: featMax,
    series: [{ name: 'Actions', value: f.count, color: CHART_COLORS.brandMid }],
  }))
  images.push({
    key: 'featureUsage',
    title: 'Feature usage',
    buffer: await svgToPng(horizontalStackedBarsSvg(featRows, [{ name: 'Actions', color: CHART_COLORS.brandMid }], 'Feature usage — actions logged')),
    width: 640,
    height: 58 + 10 + Math.max(1, featRows.length) * 30,
  })

  const procRows = usage.byProcess.map((p) => ({
    label: p.process,
    max: Math.max(1, p.employees),
    series: [
      { name: 'Adopted', value: p.adopted, color: CHART_COLORS.brandMid },
      { name: 'Active (period)', value: p.active, color: CHART_COLORS.emerald },
    ],
  }))
  images.push({
    key: 'byProcess',
    title: 'Usage by process',
    buffer: await svgToPng(
      horizontalStackedBarsSvg(
        procRows,
        [
          { name: 'Adopted', color: CHART_COLORS.brandMid },
          { name: 'Active (period)', color: CHART_COLORS.emerald },
        ],
        'Usage by process — adopted vs active employees'
      )
    ),
    width: 640,
    height: 58 + 10 + Math.max(1, procRows.length) * 30,
  })

  return images
}

// Re-export colors for any caller
export const chartColors = CHART_COLORS