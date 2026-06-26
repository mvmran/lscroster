import { useMutation } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'

/** The scheduled email jobs an admin can trigger on demand (issue #117). */
export type ScheduledJob = 'nudge' | 'reminder' | 'roster-status'

/**
 * "Send now" for a scheduled email job. Calls the `run-scheduled-job` Edge
 * Function, which fires the job in the background (the recurring versions run
 * nightly via pg_cron); the click returns immediately.
 */
export function useRunScheduledJob() {
  return useMutation({
    mutationFn: (job: ScheduledJob) =>
      invokeFunction<{ ok: boolean; started: ScheduledJob }>(
        'run-scheduled-job',
        { job },
      ),
  })
}
