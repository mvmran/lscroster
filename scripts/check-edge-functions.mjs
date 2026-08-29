// Typecheck the Edge Functions.
//
// `npm run typecheck` covers `src` only (tsconfig.app.json includes it alone),
// and eslint ignores `supabase/`, so until this script the ~5,000 lines under
// supabase/functions had no static checking at all: a type error there passed
// CI and failed at runtime, in a reminder job or an emailed response link.
//
// Every .ts file is checked except the ones listed below, so a new function is
// covered the day it is written rather than the day someone remembers to add
// it here.

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const FUNCTIONS = join(ROOT, 'supabase/functions')

/**
 * Pre-existing failures, excluded so the check can be switched on without
 * rewriting working code first.
 *
 * All of them are the same false positive: supabase-js types a to-one embedded
 * relation (`plans(...)`, `teams(name)`) as an array, while PostgREST returns a
 * single object — so `assignment.teams.name` reads as an error although it is
 * correct, and these paths email the church every week. Clearing them means
 * annotating each query's return type; worth doing, but on its own.
 */
const EXCLUDED = new Set([
  'accept-invitation/index.ts', // 1 error
  'invite/index.ts', // 2 errors
  'respond-to-request/index.ts', // 10 errors
  'send-requests/index.ts', // 2 errors
])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (entry.endsWith('.ts')) yield path
  }
}

const files = [...walk(FUNCTIONS)]
  .filter((path) => !EXCLUDED.has(relative(FUNCTIONS, path)))
  .sort()

if (files.length === 0) {
  console.error('No Edge Function sources found — has the layout changed?')
  process.exit(1)
}

try {
  execFileSync('deno', ['check', ...files], { stdio: 'inherit', cwd: ROOT })
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(
      'Deno is required to typecheck the Edge Functions.\n' +
        'Install it from https://deno.land, or skip with: npm run lint && npm run typecheck && npm test && npm run build',
    )
  }
  process.exit(1)
}

console.log(`Checked ${files.length} Edge Function sources (${EXCLUDED.size} excluded).`)
