/**
 * Verifies generated icons: the mark must be centred and the tile must have its
 * navy fill. A size-only check is not enough — an off-centre mark can still be
 * the right size, which is exactly how a double-offset bug shipped once.
 *
 * Exits non-zero on failure so `build-apk.ps1` stops before producing an APK
 * with broken icons.
 */
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AND = 'android/app/src/main/res'

/** @type {{file:string,label:string,navy:boolean}[]} */
const TARGETS = [
  { file: 'src/app/icon.png', label: 'favicon', navy: true },
  { file: 'public/icon-192.png', label: 'pwa 192', navy: true },
  { file: 'public/icon-512.png', label: 'pwa 512', navy: true },
  { file: 'public/apple-touch-icon.png', label: 'apple touch', navy: true },
  { file: `${AND}/mipmap-mdpi/ic_launcher.png`, label: 'launcher mdpi', navy: true },
  { file: `${AND}/mipmap-xxxhdpi/ic_launcher.png`, label: 'launcher xxxhdpi', navy: true },
  { file: `${AND}/mipmap-xxxhdpi/ic_launcher_round.png`, label: 'launcher round', navy: true },
  { file: `${AND}/mipmap-xxxhdpi/ic_launcher_foreground.png`, label: 'adaptive fg', navy: false },
  { file: `${AND}/drawable-mdpi/ic_stat_tasknet.png`, label: 'status mdpi', navy: false },
  { file: `${AND}/drawable-xxxhdpi/ic_stat_tasknet.png`, label: 'status xxxhdpi', navy: false },
  { file: 'public/badge.png', label: 'badge', navy: false },
]

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

async function inspect({ file, label, navy: wantNavy }) {
  const full = path.join(ROOT, file)
  if (!existsSync(full)) return { label, problem: 'missing' }

  const { data, info } = await sharp(full).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const at = (x, y) => {
    const i = (y * W + x) * 4
    return [data[i], data[i + 1], data[i + 2], data[i + 3]]
  }

  let minX = W, minY = H, maxX = -1, maxY = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b, a] = at(x, y)
      if (lum(r, g, b) > 185 && a > 128) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { label, problem: 'no mark found' }

  // 1px of rounding slack, then 2% of the canvas
  const offPx = Math.max(
    Math.abs((minX + maxX) / 2 - (W - 1) / 2),
    Math.abs((minY + maxY) / 2 - (H - 1) / 2),
  )
  const tol = 1 + W * 0.02
  if (offPx > tol) return { label, problem: `mark off-centre by ${offPx.toFixed(1)}px` }

  if (wantNavy) {
    let navy = 0
    for (const [x, y] of [[W >> 1, 3], [W >> 1, H - 4], [3, H >> 1], [W - 4, H >> 1]]) {
      const [r, g, b, a] = at(x, y)
      if (lum(r, g, b) < 140 && a > 200) navy++
    }
    if (navy < 3) return { label, problem: 'navy tile fill missing' }
  }

  const pct = `${(((maxX - minX + 1) / W) * 100).toFixed(0)}x${(((maxY - minY + 1) / H) * 100).toFixed(0)}%`
  return { label, ok: true, pct }
}

const results = await Promise.all(TARGETS.map(inspect))
let failed = 0
for (const r of results) {
  if (r.ok) {
    console.log(`  ok    ${r.label.padEnd(20)} mark ${r.pct} of canvas, centred`)
  } else {
    console.log(`  FAIL  ${r.label.padEnd(20)} ${r.problem}`)
    failed++
  }
}
if (failed) {
  console.error(`\n${failed} icon(s) failed verification — fix generate-icons.mjs before building.`)
  process.exit(1)
}
console.log(`\nall ${results.length} icons verified.`)
