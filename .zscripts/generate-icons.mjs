// Generates every Tasknet icon from one master logo: web icons, the Android
// launcher icon, and the white silhouette Android requires for notifications.
//
//   node .zscripts/generate-icons.mjs
//
// The android/ project is git-ignored, so this script is the source of truth
// for the native icons - build-apk.ps1 calls it before assembling.
//
// Pass the master logo with TASKNET_LOGO=<path>; it defaults to the brand file
// in ../Material, then to the committed favicon.
import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NAVY = '#2e4566'
const WHITE = '#ffffff'

/**
 * How much of the canvas the mark fills. The source logo has almost no padding,
 * so these scale it down; raise them to make the logo bigger.
 */
const SCALES = {
  tile: 0.6, // app + web icon
  adaptive: 0.42, // launcher foreground (extra room for the launcher's mask)
  status: 0.8, // status bar / notification icon
}

function findSource() {
  const candidates = [
    process.env.TASKNET_LOGO,
    path.resolve(ROOT, '..', '..', 'Material', 'favicon.png'),
    path.join(ROOT, 'src', 'app', 'icon.png'),
  ].filter(Boolean)
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error(`No logo found. Set TASKNET_LOGO=<path to a png>. Tried:\n  ${candidates.join('\n  ')}`)
}

const source = findSource()
console.log(`logo source: ${source}`)

/** Upscaled copy of the logo, cropped to a square. */
async function square(size, fit = 'cover') {
  return sharp(source).resize(size, size, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
}

/**
 * The logo is a navy tile with a white mark, so the mark is recovered by
 * brightness rather than by alpha (the tile itself is fully opaque). Anything
 * from near-white down to the darkest navy becomes transparent, leaving the
 * shape of the mark - which is what Android's status bar renders.
 */
async function markAlpha(size) {
  const { data, info } = await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const px = info.width * info.height
  const out = Buffer.alloc(px)
  for (let i = 0; i < px; i++) {
    const lum = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]
    const t = (lum - 185) / (255 - 185)
    out[i] = Math.max(0, Math.min(255, Math.round(t * 255)))
  }
  return { alpha: out, width: info.width, height: info.height }
}

/**
 * The mark as a flat colour on transparency, sized to fill `scale` of the
 * canvas. The mark is cropped to its own bounding box first - it occupies only
 * a small part of the logo tile, and Android's status bar draws the shape at
 * full size, so an uncropped mark would render as a speck.
 */
async function silhouette(size, colour = WHITE, scale = 1) {
  const probe = await markAlpha(512)
  const { alpha, width, height } = probe
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('no mark found in the logo: nothing bright enough stood out')

  const pad = 2
  const left = Math.max(0, minX - pad)
  const top = Math.max(0, minY - pad)
  const boxW = Math.min(width - left, maxX - minX + 1 + pad)
  const boxH = Math.min(height - top, maxY - minY + 1 + pad)

  const inner = Math.round(size * scale)
  const [r, g, b] = [parseInt(colour.slice(1, 3), 16), parseInt(colour.slice(3, 5), 16), parseInt(colour.slice(5, 7), 16)]
  const rgba = Buffer.alloc(boxW * boxH * 4)
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const src = (y + top) * width + (x + left)
      const dst = (y * boxW + x) * 4
      rgba[dst] = r
      rgba[dst + 1] = g
      rgba[dst + 2] = b
      rgba[dst + 3] = alpha[src]
    }
  }
  const logo = await sharp(rgba, { raw: { width: boxW, height: boxH, channels: 4 } })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const offset = Math.floor((size - inner) / 2)
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png()
    .toBuffer()
}

function roundedMask(size, radiusRatio = 0.22) {
  const radius = Math.round(size * radiusRatio)
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  )
}

/**
 * Brand icon: navy rounded square with the mark centred. The mark is scaled
 * rather than cropped from the source tile, so its size in the icon stays
 * under our control instead of inheriting the source's tight framing.
 */
async function tile(size, markScale = SCALES.tile) {
  const logo = await silhouette(size, WHITE, markScale)
  const offset = Math.floor((size - Math.round(size * markScale)) / 2)
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: roundedMask(size), blend: 'dest-in' },
      { input: Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" ry="${Math.round(size * 0.22)}" fill="${NAVY}"/></svg>`) },
      { input: logo, left: offset, top: offset },
    ])
    .png()
    .toBuffer()
}

const written = []
async function write(file, buf) {
  const full = path.join(ROOT, file)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, buf)
  written.push(file)
}

const androidRes = 'android/app/src/main/res'

// Web: favicon, PWA icons, and what the service worker shows in a notification.
await write('src/app/icon.png', await tile(256))
await write('public/icon-192.png', await tile(192))
await write('public/icon-512.png', await tile(512))
await write('public/icon.png', await tile(512))
await write('public/apple-touch-icon.png', await tile(180))
await write('public/badge.png', await silhouette(96, WHITE, SCALES.status))

// Android launcher icon. Adaptive icons (API 26+) let the launcher apply the
// mask, so the foreground must keep the mark inside the centre safe zone.

// Capacitor's template already ships this colour file, so update it in place;
// adding a second definition of the same colour breaks the resource merger.
const bgFile = path.join(ROOT, androidRes, 'values', 'ic_launcher_background.xml')
const bgLine = `<color name="ic_launcher_background">${NAVY}</color>`
if (existsSync(bgFile)) {
  const current = await readFile(bgFile, 'utf8')
  const updated = /<color name="ic_launcher_background">[^<]*<\/color>/.test(current)
    ? current.replace(/<color name="ic_launcher_background">[^<]*<\/color>/, bgLine)
    : current.replace('</resources>', `    ${bgLine}\n</resources>`)
  if (updated !== current) {
    await writeFile(bgFile, updated)
    written.push(`${androidRes}/values/ic_launcher_background.xml`)
  }
} else {
  await write(`${androidRes}/values/ic_launcher_background.xml`, Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    ${bgLine}\n</resources>\n`,
  ))
}
for (const [dir, size] of [['mipmap-mdpi', 48], ['mipmap-hdpi', 72], ['mipmap-xhdpi', 96], ['mipmap-xxhdpi', 144], ['mipmap-xxxhdpi', 192]]) {
  await write(`${androidRes}/${dir}/ic_launcher.png`, await tile(size))
  await write(`${androidRes}/${dir}/ic_launcher_round.png`, await tile(size))
  await write(`${androidRes}/${dir}/ic_launcher_foreground.png`, await silhouette(Math.round(size * 1.5), WHITE, SCALES.adaptive))
}
await write(`${androidRes}/mipmap-anydpi-v26/ic_launcher.xml`, Buffer.from(
  `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
    `    <background android:drawable="@color/ic_launcher_background" />\n` +
    `    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n`,
))
await write(`${androidRes}/mipmap-anydpi-v26/ic_launcher_round.xml`, Buffer.from(
  `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
    `    <background android:drawable="@color/ic_launcher_background" />\n` +
    `    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n`,
))

// Notification icon for the status bar and the notification itself.
for (const dir of ['drawable-mdpi', 'drawable-hdpi', 'drawable-xhdpi', 'drawable-xxhdpi', 'drawable-xxxhdpi']) {
  const size = { 'drawable-mdpi': 24, 'drawable-hdpi': 36, 'drawable-xhdpi': 48, 'drawable-xxhdpi': 72, 'drawable-xxxhdpi': 96 }[dir]
  await write(`${androidRes}/${dir}/ic_stat_tasknet.png`, await silhouette(size, WHITE, SCALES.status))
}

console.log(`\nwrote ${written.length} files:`)
for (const f of written) console.log('  ' + f)