import sharp from 'sharp'
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

const FONT = `"Segoe UI", Arial, "Helvetica Neue", sans-serif`

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

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const svgDoc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">` +
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
    `<text x="${W / 2}" y="26" text-anchor="middle" font-size="15" font-weight="700" fill="${CHART_COLORS.brandDark}">${esc(title)}</text>`
  )

  if (total === 0) {
    parts.push(
      `<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="13" fill="${CHART_COLORS.slateLight}">No data</text>`
    )
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
      `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="26" font-weight="700" fill="${CHART_COLORS.brandDark}">${total}</text>`,
      `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="10" fill="${CHART_COLORS.slateLight}">assignments</text>`
    )
  }

  // Legend
  const legendRows: string[] = []
  slices.forEach((s, i) => {
    const ly = 30 + i * 34
    legendRows.push(
      `<rect x="${legendX}" y="${ly - 10}" width="12" height="12" rx="3" fill="${s.color}"/>`,
      `<text x="${legendX + 20}" y="${ly}" font-size="12" fill="${CHART_COLORS.slate}">${esc(s.label)}</text>`,
      `<text x="${legendX + 196}" y="${ly}" text-anchor="end" font-size="12" font-weight="600" fill="${CHART_COLORS.brandDark}">${s.value}${total ? ` (${Math.round((s.value / total) * 100)}%)` : ''}</text>`
    )
  })
  parts.push(...legendRows)

  return svgDoc(W, H, parts.join(''))
}

/** Map a value to an SVG point on a line-chart plot area. */
function useScale(values: number[], w: number, h: number) {
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
    `<text x="${W / 2}" y="20" text-anchor="middle" font-size="15" font-weight="700" fill="${CHART_COLORS.brandDark}">${esc(title)}</text>`
  )

  if (points.length === 0) {
    parts.push(
      `<text x="${(mL + W - mR) / 2}" y="${mT + ch / 2}" text-anchor="middle" font-size="13" fill="${CHART_COLORS.slateLight}">No data</text>`
    )
    return svgDoc(W, H, parts.join(''))
  }

  const dueMax = Math.max(1, ...points.map((p) => Math.max(p.due, p.completed, p.late)))
  const yScale = useScale([dueMax * 1.05], ch, ch)
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
      `<text x="${mL - 6}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="${CHART_COLORS.slateLight}">${val}</text>`
    )
  }

  // X labels
  points.forEach((p, i) => {
    parts.push(
      `<text x="${xOf(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${CHART_COLORS.slateLight}">${esc(p.label)}</text>`
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
    const textW = label.length * 7
    parts.push(
      dashed
        ? `<line x1="${lx}" y1="20" x2="${lx + 18}" y2="20" stroke="${color}" stroke-width="2.6" stroke-dasharray="5 3"/>`
        : `<line x1="${lx}" y1="20" x2="${lx + 18}" y2="20" stroke="${color}" stroke-width="2.6"/>`,
      `<text x="${lx + 24}" y="23.5" font-size="11" fill="${CHART_COLORS.slate}">${label}</text>`
    )
    lx += 18 + textW + 22
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
    `<text x="${W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="700" fill="${CHART_COLORS.brandDark}">${esc(title)}</text>`
  )

  if (rows.length === 0) {
    parts.push(
      `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="${CHART_COLORS.slateLight}">No data</text>`
    )
    return svgDoc(W, H, parts.join(''))
  }

  // Grid vertical lines (light)
  const vTicks = 4
  for (let t = 0; t <= vTicks; t++) {
    const x = mL + (plotW / vTicks) * t
    parts.push(
      `<line x1="${x}" y1="${mT - 4}" x2="${x}" y2="${H - mB}" stroke="${CHART_COLORS.grid}" stroke-width="1"/>`,
      `<text x="${x}" y="${H - mB + 4}" text-anchor="middle" font-size="9.5" fill="${CHART_COLORS.slateLight}">${Math.round((maxTotal * t) / vTicks)}</text>`
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
      `<text x="${mL - 8}" y="${labelY}" text-anchor="end" font-size="10.5" fill="${CHART_COLORS.slate}" font-weight="600">${esc(r.label)}</text>`,
      ...segs
    )
  })

  // Legend
  let lx = mL
  const estLegend = (n: string) => n.length * 7.2
  for (const l of legend) {
    const w = estLegend(l.name)
    parts.push(
      `<rect x="${lx}" y="38" width="12" height="12" rx="2.5" fill="${l.color}"/>`,
      `<text x="${lx + 16}" y="47.5" font-size="11" fill="${CHART_COLORS.slate}">${esc(l.name)}</text>`
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
    `<text x="${W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="700" fill="${CHART_COLORS.brandDark}">${esc(title)}</text>`
  )

  if (rows.length === 0) {
    parts.push(
      `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="${CHART_COLORS.slateLight}">No data</text>`
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
      `<text x="16" y="${y + 29}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${CHART_COLORS.slate}">${i + 1}</text>`,
      `<text x="${mL}" y="${y + 14}" font-size="11.5" font-weight="600" fill="${CHART_COLORS.brandDark}">${esc(r.name)}</text>`,
      `<text x="${mL}" y="${y + 34}" font-size="9.5" fill="${CHART_COLORS.slateLight}">${r.done}/${r.total} done${r.overdue > 0 ? ' · ' + r.overdue + ' overdue' : ' · nothing overdue'}</text>`,
      `<rect x="${mL}" y="${barY}" width="${plotW}" height="${barH}" rx="${barH / 2}" fill="${CHART_COLORS.grid}"/>`,
      `<rect x="${mL}" y="${barY}" width="${Math.max(1.5, (r.rate / 100) * plotW)}" height="${barH}" rx="${barH / 2}" fill="${color}"/>`,
      `<text x="${mL + plotW}" y="${barY + barH - 2}" text-anchor="end" font-size="12" font-weight="700" fill="${CHART_COLORS.brandDark}">${r.rate}%</text>`
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
    `<text x="${W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="700" fill="${CHART_COLORS.brandDark}">${esc(title)}</text>`
  )

  if (rows.length === 0) {
    parts.push(
      `<text x="${W / 2}" y="${mT + ch / 2}" text-anchor="middle" font-size="13" fill="${CHART_COLORS.slateLight}">No data</text>`
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
      `<text x="${mL - 6}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="${CHART_COLORS.slateLight}">${val}</text>`
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
    parts.push(
      `<text x="${gx + barW / 2}" y="${H - 10}" text-anchor="middle" font-size="10" fill="${CHART_COLORS.slate}" transform="rotate(-16 ${gx + barW / 2} ${H - 10})">${esc(label)}</text>`
    )
  })

  let lx = mL
  for (const l of legend) {
    const w = l.name.length * 7.2
    parts.push(
      `<rect x="${lx}" y="40" width="12" height="12" rx="2.5" fill="${l.color}"/>`,
      `<text x="${lx + 16}" y="49.5" font-size="11" fill="${CHART_COLORS.slate}">${esc(l.name)}</text>`
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

// Re-export colors for any caller
export const chartColors = CHART_COLORS