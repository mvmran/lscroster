import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Run a git command, returning undefined outside a checkout (or without git). */
function git(command: string): string | undefined {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined
  } catch {
    return undefined
  }
}

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string }

// Version stamp shown in the app footer (Settings page).
//
// `package.json.version` is the declared release number: it is in the tree, so
// every build — local, CI, or Vercel's tagless shallow clone — reports the same
// thing. Cutting a release bumps it in the release commit and tags the same
// number (see PHASES.md → Releases).
const appVersion = pkg.version
// The build id is the commit the bundle was built from. Vercel supplies the
// SHA as an env var; locally we ask git.
const buildCommit = (process.env.VERCEL_GIT_COMMIT_SHA ?? git('git rev-parse HEAD') ?? '')
  .slice(0, 7)
// A `+` suffix marks a build made from a dirty working tree, so a hand-made
// local build is never mistaken for a clean build of that commit. Only asked
// locally: a CI or Vercel checkout is clean by construction, and its build
// steps leave files behind that make `git status` report otherwise.
const buildDirty =
  !process.env.VERCEL && !process.env.CI && Boolean(git('git status --porcelain'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_COMMIT__: JSON.stringify(buildCommit ? buildCommit + (buildDirty ? '+' : '') : 'unknown'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
