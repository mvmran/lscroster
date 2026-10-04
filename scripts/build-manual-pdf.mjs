// Build docs/USER-MANUAL.md into a branded PDF.
//
//   npm run manual:pdf                          → manual-pdf/LSCroster-User-Manual.pdf
//   npm run manual:pdf -- out.pdf --cover=light --church="Grace Community Church"
//
// The Markdown is turned into a styled HTML page — the app's Geist face and
// brand tokens (src/index.css, hue 278) — and printed by headless Chromium: a
// dark cover, a contents page with real page numbers, chapter openers, and dark
// running header/footer bands. The cover is printed on its own (it carries no
// bands) and joined to the body with pdfunite. Contents page numbers come from a
// first pass: print, read each page's text back with pdftotext, find where every
// heading landed, then print again with the numbers filled in.
//
// One-time setup (no sudo): `npx playwright-core install chromium`.
// Also needs poppler-utils (`sudo apt install poppler-utils`) for pdfunite and
// pdftotext. On a bare Debian/Ubuntu box Chromium may also want its system
// libraries: `sudo npx playwright-core install-deps chromium`.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Marked } from 'marked'
import { chromium } from 'playwright-core'

const ROOT = new URL('..', import.meta.url).pathname
const DOCS = join(ROOT, 'docs')

const args = process.argv.slice(2)
// `npm run manual:pdf -- --church=X` reaches the script as an argument, but without
// the `--` npm keeps the flag for itself and hands it on only as npm_config_church
// — accept both, so a forgotten `--` doesn't silently drop the option.
const flag = (name) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : process.env[`npm_config_${name}`]
}
const OUT = resolve(
  args.find((a) => !a.startsWith('--')) ?? join(ROOT, 'manual-pdf/LSCroster-User-Manual.pdf'),
)
const LIGHT_COVER = flag('cover') === 'light'
const CHURCH = flag('church') ?? 'Your Church Name'
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
const DATE = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(
  new Date(),
)

// ---- Prerequisites, checked up front so a missing tool fails with the fix.
for (const tool of ['pdfunite', 'pdftotext']) {
  try {
    execFileSync(tool, ['-v'], { stdio: 'ignore' })
  } catch (error) {
    if (error.code !== 'ENOENT') continue
    console.error(`${tool} not found — install poppler-utils (sudo apt install poppler-utils).`)
    process.exit(1)
  }
}

// ---- Fonts: Geist (the app's face), embedded so the header/footer can use it.
const FONT_DIR = join(ROOT, 'node_modules/@fontsource-variable/geist/files')
const geist = (file) => readFileSync(join(FONT_DIR, file)).toString('base64')
const FONT_CSS = `
@font-face { font-family: 'Geist'; font-weight: 100 900; font-style: normal;
  src: url(data:font/woff2;base64,${geist('geist-latin-wght-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Geist'; font-weight: 100 900; font-style: italic;
  src: url(data:font/woff2;base64,${geist('geist-latin-wght-italic.woff2')}) format('woff2'); }
@font-face { font-family: 'Geist'; font-weight: 100 900; font-style: normal;
  src: url(data:font/woff2;base64,${geist('geist-latin-ext-wght-normal.woff2')})
    format('woff2');
  unicode-range: U+0100-024F, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113,
    U+2C60-2C7F, U+A720-A7FF; }
`

// ---- Brand tokens, from src/index.css (hue 278 = the shipped indigo).
const TOKENS = `
:root {
  --hue: 278;
  --ink: oklch(0.145 0 0);
  --ink-soft: oklch(0.38 0 0);
  --muted: oklch(0.556 0 0);
  --rule: oklch(0.922 0 0);
  --primary: oklch(0.51 0.22 var(--hue));
  --primary-soft: oklch(0.72 0.14 var(--hue));
  --accent: oklch(0.955 0.02 var(--hue));
  --accent-ink: oklch(0.32 0.08 var(--hue));
  --night: oklch(0.17 0.025 var(--hue));
  --warn: oklch(0.6 0.2 25);
  --warn-bg: oklch(0.97 0.02 25);
  --tip: oklch(0.55 0.13 160);
  --tip-bg: oklch(0.97 0.025 160);
}
`

// ---- Markdown → HTML.

// GitHub's heading anchors, so the manual's own [§x.y](#…) links work in the PDF.
function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/[*_`]/g, '')
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-')
}

let md = readFileSync(join(DOCS, 'USER-MANUAL.md'), 'utf8')
md = md.replace(/<!--[\s\S]*?-->/g, '')
// The Markdown cover block and the hand-written contents are both rebuilt here.
md = md.replace(/^<div align="center">[\s\S]*?<\/div>\s*/m, '')
md = md.replace(/^## Contents\n[\s\S]*?(?=^## How this manual)/m, '')
md = md.replace(/^---\s*$/gm, '')

const headings = [] // { depth, text, id } in document order
const marked = new Marked({ gfm: true })
marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      const inner = this.parser.parseInline(tokens)
      const id = slug(text)
      headings.push({ depth, text: text.replace(/&amp;/g, '&'), id })
      if (depth === 1) {
        const num = text.match(/^(\d+)\./)?.[1] ?? ''
        const kicker = num === '15' ? 'Appendix' : `Chapter ${num}`
        return `<section class="chapter-open" id="${id}">
          <div class="chapter-kicker">${kicker}</div><div class="chapter-num">${num}</div>
          <h1>${inner.replace(/^\d+\.\s+/, '')}</h1><div class="chapter-rule"></div>
          </section>`
      }
      if (depth === 2) {
        const m = inner.match(/^(\d+\.\d+|[A-F]\.)\s+(.*)$/)
        if (!m) return `<h2 id="${id}" class="front">${inner}</h2>`
        const num = m[1].replace(/\.$/, '')
        return `<h2 id="${id}"><span class="sec-num">${num}</span>${m[2]}</h2>`
      }
      return `<h${depth} id="${id}">${inner}</h${depth}>`
    },
    // > **Note** — / **Tip** — / **Warning** — blockquotes become callout panels.
    blockquote({ tokens }) {
      const body = this.parser.parse(tokens)
      const kind = body.match(/^<p><strong>(Note|Tip|Warning)<\/strong>/)?.[1]
      if (!kind) return `<blockquote>${body}</blockquote>`
      const text = body.replace(/^<p><strong>\w+<\/strong>\s*—\s*/, '<p>')
      return `<aside class="callout callout-${kind.toLowerCase()}">
        <div class="callout-label">${kind}</div>${text}</aside>`
    },
  },
})

// No installed font draws ✨, so use the app's own Lucide "sparkles" icon.
const SPARKLES = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2
  0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5
  0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0
  0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>
  <path d="M4 17v2"/><path d="M5 18H3"/></svg>`

let body = marked.parse(md)
body = body
  // Images resolve against docs/.
  .replace(/src="(screenshots\/[^"]+)"/g, (_, p) => `src="${pathToFileURL(join(DOCS, p))}"`)
  // Sibling docs aren't in the PDF — name them rather than leave dead links.
  .replace(/<a href="([A-Z-]+\.md)">([^<]+)<\/a>/g, '<span class="doc-ref">$2</span>')
  // Table ticks read better as small accent dots (and no font here has ✅).
  .replace(/<td align="center">—<\/td>/g, '<td align="center"><span class="no">–</span></td>')
  .replace(/✅/g, '<span class="yes">●</span>')
  .replace(/✨/g, SPARKLES)

// ---- Contents; `pages` is null on the first pass (same width placeholders).
function contents(pages) {
  const rows = headings
    .filter((h) => h.depth <= 2)
    .map((h, i) => {
      const m = h.text.match(/^(\d+)\.\s+(.*)$/) ?? h.text.match(/^(\d+\.\d+|[A-F]\.)\s+(.*)$/)
      const num = m ? m[1].replace(/\.$/, '') : ''
      const kind = h.depth === 1 ? 'toc-ch' : 'toc-sec'
      return `<a class="toc-row ${kind}" href="#${h.id}">
        <span class="toc-num">${num}</span><span class="toc-title">${m ? m[2] : h.text}</span>
        <span class="toc-dots"></span><span class="toc-page">${pages?.[i] ?? '00'}</span></a>`
    })
  return `<section class="toc"><div class="toc-kicker">Contents</div>
    <h1 class="toc-head">What's inside</h1>${rows.join('\n')}</section>`
}

const BODY_CSS = `
${FONT_CSS}${TOKENS}
@page { size: A4; margin: 24mm 18mm 22mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Geist', 'DejaVu Sans', sans-serif; color: var(--ink); font-size: 10pt;
  line-height: 1.55; margin: 0; }
p { margin: 0 0 7pt; orphans: 3; widows: 3; }
a { color: var(--primary); text-decoration: none; }
strong { font-weight: 640; }
em { color: var(--ink-soft); }
code { font-family: 'DejaVu Sans Mono', monospace; font-size: 8.6pt; background: var(--accent);
  color: var(--accent-ink); padding: 0.5pt 3pt; border-radius: 3pt; }
ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
li { margin: 0 0 3pt; }
li::marker { color: var(--primary); font-weight: 600; }
.doc-ref { font-weight: 600; color: var(--accent-ink); }
.icon { width: 1.05em; height: 1.05em; vertical-align: -0.17em; color: var(--primary); }

/* Contents */
.toc { break-after: page; }
.toc-kicker, .chapter-kicker { font-size: 8pt; font-weight: 700; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--primary); }
.toc-head { font-size: 26pt; font-weight: 750; letter-spacing: -0.02em; margin: 4pt 0 14pt; }
.toc-row { display: flex; align-items: baseline; gap: 6pt; color: var(--ink);
  break-inside: avoid; }
.toc-ch { font-weight: 650; font-size: 10.5pt; margin-top: 7pt; padding-top: 5pt;
  border-top: 0.6pt solid var(--rule); }
.toc-sec { font-size: 8.8pt; color: var(--ink-soft); line-height: 1.75; }
.toc-num { width: 26pt; flex: none; color: var(--primary); font-variant-numeric: tabular-nums; }
.toc-sec .toc-num { padding-left: 12pt; width: 46pt; color: var(--muted); }
.toc-title { flex: none; max-width: 75%; }
.toc-dots { flex: 1; border-bottom: 1.1pt dotted oklch(0.8 0 0); transform: translateY(-3pt); }
.toc-page { flex: none; min-width: 16pt; text-align: right; color: var(--ink-soft);
  font-variant-numeric: tabular-nums; }
.toc-ch .toc-page { color: var(--ink); }

/* Front matter (Notice, How this manual is organised, If you want…) */
h2.front { font-size: 17pt; font-weight: 720; letter-spacing: -0.01em; margin: 0 0 8pt;
  padding-bottom: 6pt; border-bottom: 2pt solid var(--primary); }
h2#notice--about-this-manual { break-before: page; }
h2#if-you-want-go-to { margin-top: 18pt; }

/* Chapter openers */
.chapter-open { break-before: page; position: relative; margin: 6mm 0 14pt; padding-top: 4pt; }
.chapter-num { position: absolute; right: 0; top: -14pt; font-size: 64pt; font-weight: 800;
  line-height: 1; color: var(--accent); letter-spacing: -0.04em; }
.chapter-open h1 { position: relative; font-size: 25pt; font-weight: 760; line-height: 1.15;
  letter-spacing: -0.02em; margin: 4pt 0 0; }
.chapter-rule { height: 3pt; width: 46pt; background: var(--primary); margin-top: 9pt;
  border-radius: 2pt; }

h2 { font-size: 13.5pt; font-weight: 680; margin: 18pt 0 6pt; break-after: avoid; }
h2 .sec-num { display: inline-block; min-width: 30pt; color: var(--primary); font-weight: 700;
  font-variant-numeric: tabular-nums; }
h3 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }

/* Tables */
table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 4pt 0 12pt;
  font-size: 8.9pt; line-height: 1.45; border: 0.75pt solid oklch(0.88 0 0);
  border-radius: 5pt; overflow: hidden; }
thead { display: table-header-group; }
th { background: var(--accent); color: var(--accent-ink); font-weight: 650; text-align: left;
  padding: 5pt 7pt; border-bottom: 0.75pt solid oklch(0.86 0.03 var(--hue)); }
td { padding: 4.5pt 7pt; vertical-align: top; border-bottom: 0.5pt solid var(--rule); }
tr:last-child td { border-bottom: 0; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: oklch(0.985 0.004 var(--hue)); }
td:first-child { font-weight: 560; }
td[align="center"], th[align="center"] { white-space: nowrap; }
.yes { color: var(--primary); font-size: 8pt; }
.no { color: oklch(0.75 0 0); }

/* Callouts */
.callout { margin: 8pt 0 12pt; padding: 7pt 10pt 3pt 12pt; border-left: 3pt solid var(--primary);
  background: var(--accent); border-radius: 0 5pt 5pt 0; break-inside: avoid; font-size: 9.3pt; }
.callout-label { font-size: 7.4pt; font-weight: 750; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--primary); margin-bottom: 2pt; }
.callout-tip { border-color: var(--tip); background: var(--tip-bg); }
.callout-tip .callout-label { color: var(--tip); }
.callout-warning { border-color: var(--warn); background: var(--warn-bg); }
.callout-warning .callout-label { color: var(--warn); }
blockquote { margin: 8pt 0; padding: 4pt 12pt; border-left: 3pt solid var(--primary-soft);
  color: var(--ink-soft); font-style: italic; }

/* Figures */
figure { margin: 10pt 0 14pt; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; height: auto; border-radius: 6pt;
  border: 0.75pt solid oklch(0.88 0 0);
  box-shadow: 0 6pt 18pt -6pt oklch(0.3 0.08 var(--hue) / 0.35); }
figure img[width="320"] { width: 52mm; }
figure img[width="720"] { width: 100%; }
figcaption, figcaption em { margin-top: 6pt; font-size: 8.4pt; color: var(--muted); }
`

const COVER_CSS = `
${FONT_CSS}${TOKENS}
@page { size: A4; margin: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: 'Geist', sans-serif; }
.cover { width: 210mm; height: 297mm; position: relative; overflow: hidden; color: white;
  background: radial-gradient(120% 70% at 50% 0%, oklch(0.3 0.09 var(--hue)) 0%,
    var(--night) 55%, oklch(0.12 0.02 var(--hue)) 100%); }
.glow { position: absolute; left: 50%; top: 150mm; width: 190mm; height: 120mm;
  transform: translate(-50%, -50%); filter: blur(10mm);
  background: radial-gradient(closest-side, oklch(0.51 0.22 var(--hue) / 0.55), transparent); }
.top { position: absolute; top: 30mm; left: 0; right: 0; text-align: center; }
.kicker { font-size: 9pt; letter-spacing: 0.42em; text-transform: uppercase; font-weight: 600;
  color: var(--primary-soft); }
.rule { width: 34mm; height: 0.6pt; background: oklch(1 0 0 / 0.35); margin: 7mm auto; }
.title { font-size: 54pt; font-weight: 800; letter-spacing: 0.16em; margin: 0;
  padding-left: 0.16em; }
.subtitle { margin-top: 4mm; font-size: 14pt; color: var(--primary-soft); font-weight: 500; }
.tagline { margin: 4mm auto 0; width: 120mm; font-size: 9.5pt; line-height: 1.6;
  color: oklch(1 0 0 / 0.62); }
.hero { position: absolute; left: 50%; top: 152mm; transform: translate(-50%, -50%);
  width: 150mm; }
.hero img { width: 100%; border-radius: 4mm; border: 0.8pt solid oklch(1 0 0 / 0.18);
  box-shadow: 0 10mm 26mm -6mm oklch(0 0 0 / 0.7); }
.phone { position: absolute; right: -10mm; bottom: -16mm; width: 40mm; }
.phone img { width: 100%; border-radius: 4mm; border: 2.4mm solid oklch(0.12 0.02 var(--hue));
  box-shadow: 0 8mm 20mm -4mm oklch(0 0 0 / 0.75); }
.meta { position: absolute; bottom: 26mm; left: 0; right: 0; text-align: center; }
.meta .rule { margin: 0 auto 6mm; }
.meta-line { font-size: 10pt; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--primary-soft); font-weight: 600; }
.meta-sub { margin-top: 2.5mm; font-size: 9pt; color: oklch(1 0 0 / 0.55);
  letter-spacing: 0.04em; }

/* --cover=light: white page, a wash of the accent from the top, an ink title. */
.cover.light { color: var(--ink);
  background: radial-gradient(130% 62% at 50% 0%, oklch(0.93 0.045 var(--hue)) 0%,
    oklch(0.975 0.015 var(--hue)) 48%, oklch(1 0 0) 100%); }
.cover.light .glow {
  background: radial-gradient(closest-side, oklch(0.62 0.2 var(--hue) / 0.28), transparent); }
.cover.light .kicker, .cover.light .subtitle, .cover.light .meta-line { color: var(--primary); }
.cover.light .rule { background: oklch(0.51 0.22 var(--hue) / 0.45); }
.cover.light .title { color: var(--night); }
.cover.light .tagline { color: var(--ink-soft); }
.cover.light .hero img { border-color: oklch(0.88 0.02 var(--hue));
  box-shadow: 0 10mm 26mm -8mm oklch(0.35 0.12 var(--hue) / 0.38); }
.cover.light .phone img { border-color: var(--night);
  box-shadow: 0 8mm 20mm -6mm oklch(0.25 0.1 var(--hue) / 0.5); }
.cover.light .meta-sub { color: var(--muted); }
.cover.light::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0;
  height: 5mm; background: linear-gradient(90deg, var(--night),
    oklch(0.3 0.09 var(--hue)), var(--night)); }
`

const shot = (file) => pathToFileURL(join(DOCS, 'screenshots', file))
const coverHtml = `<!doctype html><html><head><meta charset="utf-8">
<style>${COVER_CSS}</style></head><body>
<div class="cover${LIGHT_COVER ? ' light' : ''}"><div class="glow"></div>
  <div class="top">
    <div class="kicker">User Manual · Guide</div>
    <div class="rule"></div>
    <h1 class="title">LSCROSTER</h1>
    <div class="subtitle">Worship &amp; service planning</div>
    <div class="tagline">
      Plan services, schedule teams, and respond to requests from your phone.</div>
  </div>
  <div class="hero"><img src="${shot('plan.png')}">
    <div class="phone"><img src="${shot('request-phone.png')}"></div></div>
  <div class="meta"><div class="rule"></div>
    <div class="meta-line">Version ${VERSION} · ${DATE}</div>
    <div class="meta-sub">${CHURCH}</div></div>
</div></body></html>`

// Header and footer bands. Chromium renders these templates in isolation, so
// everything they need is inline.
const band = (edge) => `<style>${FONT_CSS}</style><div style="
  -webkit-print-color-adjust: exact; position: absolute; ${edge}: 0; left: 0; right: 0;
  height: 11mm; padding: 0 18mm; background: oklch(0.17 0.025 278); display: flex;
  align-items: center; justify-content: space-between; font-family: Geist, sans-serif;
  font-size: 7.5pt; letter-spacing: 0.06em;">`
const HEADER = `${band('top')}
  <span style="color: oklch(0.72 0.14 278); font-weight: 700; letter-spacing: 0.22em;">
    LSCROSTER</span>
  <span style="color: oklch(0.7 0 0);">User Manual &amp; Guide</span></div>`
const FOOTER = `${band('bottom')}
  <span style="color: oklch(0.7 0 0);">Version ${VERSION} · ${DATE} · ${CHURCH}</span>
  <span style="color: white; font-weight: 600;"><span class="pageNumber"></span>
    <span style="color: oklch(0.55 0 0);"> / <span class="totalPages"></span></span></span>
  </div>`

const bodyHtml = (pages) => `<!doctype html><html><head><meta charset="utf-8">
  <title>LSCroster — User Manual</title><style>${BODY_CSS}</style></head>
  <body>${contents(pages)}${body}</body></html>`

// Where each contents entry landed, read back from the first pass's text. The
// search runs forward from the previous hit, so a heading's words appearing
// earlier in the text (or in the contents itself) can't match first.
function findPages(pdf) {
  const pageTexts = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' })
    .split('\f')
    .map((t) => t.replace(/\s+/g, ' '))
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*')
  let cursor = Math.max(1, pageTexts.findIndex((t) => t.includes('This manual is for everyone')))
  const entries = headings.filter((h) => h.depth <= 2)
  const pages = entries.map((h) => {
    const chapter = h.text.match(/^\d+\.\s+(.*)$/)
    const section = h.text.match(/^(\d+\.\d+|[A-F])\.?\s+(.*)$/)
    const re = new RegExp(
      chapter
        ? esc(chapter[1])
        : section
          ? `${esc(section[1])}\\s*${esc(section[2])}`
          : esc(h.text),
    )
    for (let p = cursor; p < pageTexts.length; p++) {
      if (re.test(pageTexts[p])) {
        cursor = p
        return String(p + 1)
      }
    }
    return '?'
  })
  const lost = entries.filter((_, i) => pages[i] === '?').map((h) => h.text)
  if (lost.length) console.warn(`Contents: no page found for ${lost.join(' · ')}`)
  return pages
}

const work = mkdtempSync(join(tmpdir(), 'lscroster-manual-'))
let browser
try {
  try {
    browser = await chromium.launch()
  } catch (error) {
    console.error(String(error.message).split('\n')[0])
    console.error('Install the browser once with: npx playwright-core install chromium')
    rmSync(work, { recursive: true, force: true })
    process.exit(1)
  }
  const tab = await browser.newPage()
  const print = async (html, name, options) => {
    const htmlFile = join(work, `${name}.html`)
    writeFileSync(htmlFile, html)
    await tab.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' })
    await tab.evaluate(() => document.fonts.ready)
    const pdf = join(work, `${name}.pdf`)
    await tab.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true, ...options })
    return pdf
  }
  const bands = { displayHeaderFooter: true, headerTemplate: HEADER, footerTemplate: FOOTER }

  const draft = await print(bodyHtml(null), 'draft', bands)
  const final = await print(bodyHtml(findPages(draft)), 'body', bands)
  const cover = await print(coverHtml, 'cover', {})

  mkdirSync(dirname(OUT), { recursive: true })
  execFileSync('pdfunite', [cover, final, OUT])
  console.log(`Wrote ${OUT}`)
} finally {
  await browser?.close()
  rmSync(work, { recursive: true, force: true })
}
