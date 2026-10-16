// One tint per section family, shared by the lyrics editor's gutter chevrons,
// extent rails and sequence pills, and the Lyrics Sheet's sequence, so a chorus
// reads as the same colour everywhere. Kinds not listed fall back to slate.
const SECTION_TINTS: Record<string, { chip: string; rail: string }> = {
  verse: {
    chip: 'bg-sky-200/70 text-sky-900 dark:bg-sky-900/60 dark:text-sky-200',
    rail: 'bg-sky-500/50 dark:bg-sky-400/40',
  },
  chorus: {
    chip: 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200',
    rail: 'bg-emerald-500/50 dark:bg-emerald-400/40',
  },
  refrain: {
    chip: 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200',
    rail: 'bg-emerald-500/50 dark:bg-emerald-400/40',
  },
  'pre-chorus': {
    chip: 'bg-teal-200/70 text-teal-900 dark:bg-teal-900/60 dark:text-teal-200',
    rail: 'bg-teal-500/50 dark:bg-teal-400/40',
  },
  bridge: {
    chip: 'bg-amber-200/70 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
    rail: 'bg-amber-500/50 dark:bg-amber-400/40',
  },
  instrumental: {
    chip: 'bg-violet-200/70 text-violet-900 dark:bg-violet-900/60 dark:text-violet-200',
    rail: 'bg-violet-500/50 dark:bg-violet-400/40',
  },
}
for (const kind of ['interlude', 'vamp', 'turnaround', 'breakdown', 'channel', 'descant', 'hook']) {
  SECTION_TINTS[kind] = SECTION_TINTS.instrumental
}
const DEFAULT_TINT = {
  chip: 'bg-slate-200/70 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300',
  rail: 'bg-slate-400/50 dark:bg-slate-500/40',
}
export const tintOf = (kind: string) => SECTION_TINTS[kind] ?? DEFAULT_TINT
