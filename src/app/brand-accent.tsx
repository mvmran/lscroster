import { useEffect } from 'react'
import { applyBrandHue, cacheBrandHue, DEFAULT_BRAND_HUE } from '@/lib/brand'
import { useChurchSettings } from '@/features/settings/use-church-settings'

/**
 * Applies the church's accent hue (church_settings.brand_hue) to the document.
 *
 * Renders nothing. Mounted above the router so the sign-in page is branded too
 * — church_settings is anon-readable for exactly that reason. Boot already
 * applied the cached hue (main.tsx); this corrects it once settings arrive and
 * refreshes the cache for next time.
 */
export function BrandAccent() {
  const { data: settings } = useChurchSettings()
  const hue = settings?.brand_hue ?? null

  useEffect(() => {
    if (hue === null) return
    applyBrandHue(hue)
    cacheBrandHue(hue)
  }, [hue])

  useEffect(() => {
    // Instance not set up yet (no settings row): fall back to the shipped hue
    // rather than whatever a previous instance left in localStorage.
    if (settings === null) applyBrandHue(DEFAULT_BRAND_HUE)
  }, [settings])

  return null
}
