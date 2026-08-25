/**
 * Version stamp for this build, frozen in at build time by Vite (see
 * vite.config.ts). Shown in the Settings page footer so anyone — including a
 * church running their own instance — can say exactly which build they are on.
 */

/** Declared release version (`package.json`, tagged in git at release). */
export const APP_VERSION = __APP_VERSION__

/** Commit the bundle was built from; `+` means a dirty working tree. */
export const BUILD_COMMIT = __BUILD_COMMIT__

/** ISO timestamp of the build. */
export const BUILD_DATE = __BUILD_DATE__

export const APP_NAME = 'LSCRoster'
