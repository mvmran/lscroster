/**
 * Brand accent (Phase 5 — distribution).
 *
 * The entire theme derives from one oklch hue (`--brand-hue` in index.css), so
 * an instance re-brands by changing a single number. That number lives in
 * `church_settings.brand_hue` and is applied to the document at runtime, which
 * means a church picks its colour in Settings instead of editing CSS.
 *
 * The last applied hue is cached in localStorage and re-applied synchronously
 * on boot: church settings arrive over the network, and without the cache the
 * first paint of every reload would flash the default indigo.
 */

/** oklch hue degrees shipped as the CSS default (deep indigo). */
export const DEFAULT_BRAND_HUE = 278

const CACHE_KEY = 'lscroster-brand-hue'

export type BrandPreset = { name: string; hue: number }

/**
 * The accent choices offered in Settings. Hues are spread far enough apart to
 * be told apart at a glance on a phone; every one has been checked against the
 * light and dark palettes (contrast comes from the fixed lightness/chroma in
 * index.css, not from the hue).
 */
export const BRAND_PRESETS: BrandPreset[] = [
  { name: 'Indigo', hue: 278 },
  { name: 'Violet', hue: 300 },
  { name: 'Blue', hue: 255 },
  { name: 'Sky', hue: 230 },
  { name: 'Teal', hue: 185 },
  { name: 'Green', hue: 150 },
  { name: 'Olive', hue: 120 },
  { name: 'Amber', hue: 75 },
  { name: 'Orange', hue: 45 },
  { name: 'Red', hue: 25 },
  { name: 'Rose', hue: 5 },
  { name: 'Magenta', hue: 340 },
]

/** Clamp to the 0-360 range the column's CHECK constraint allows. */
export function clampHue(hue: number): number {
  if (!Number.isFinite(hue)) return DEFAULT_BRAND_HUE
  return Math.min(360, Math.max(0, Math.round(hue)))
}

/** Nearest preset name for a hue, for labelling the current selection. */
export function presetName(hue: number): string {
  let closest = BRAND_PRESETS[0]
  for (const preset of BRAND_PRESETS) {
    if (Math.abs(preset.hue - hue) < Math.abs(closest.hue - hue)) closest = preset
  }
  return Math.abs(closest.hue - hue) <= 4 ? closest.name : 'Custom'
}

/** Set the CSS variable every branded token derives from. */
export function applyBrandHue(hue: number): void {
  document.documentElement.style.setProperty('--brand-hue', String(clampHue(hue)))
}

/** Remember the hue so the next boot paints it before settings load. */
export function cacheBrandHue(hue: number): void {
  try {
    localStorage.setItem(CACHE_KEY, String(clampHue(hue)))
  } catch {
    // Private-mode / storage-disabled browsers just get the flash of default.
  }
}

/** Apply the cached hue (called at boot, before React renders). */
export function applyCachedBrandHue(): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached === null) return
    const hue = Number(cached)
    if (Number.isFinite(hue)) applyBrandHue(hue)
  } catch {
    // Ignore — the CSS default stands.
  }
}
