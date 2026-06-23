import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { usePeopleManagedBy } from '@/features/people/use-people'
import { fullName } from '@/features/people/person-utils'
import { useCreateBlockout } from '@/features/scheduling/use-blockouts'

/** Add a blockout: pick a date range on the calendar, optional reason. */
export function BlockoutDialog({
  personId,
  open,
  onOpenChange,
}: {
  personId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createBlockout = useCreateBlockout()
  const [range, setRange] = useState<DateRange | undefined>()
  const [reason, setReason] = useState('')

  const { data: me } = useCurrentPerson()
  const { data: managed = [] } = usePeopleManagedBy(me?.id)

  const [targetId, setTargetId] = useState(personId)

  const accounts = useMemo(() => {
    if (!me) return []
    return [
      { id: me.id, name: fullName(me) },
      ...managed.map((p) => ({ id: p.id, name: fullName(p) })),
    ]
  }, [me, managed])

  async function save() {
    if (!range?.from) return
    try {
      await createBlockout.mutateAsync({
        person_id: targetId,
        start_date: format(range.from, 'yyyy-MM-dd'),
        end_date: format(range.to ?? range.from, 'yyyy-MM-dd'),
        reason: reason.trim() || null,
      })
      toast.success('Blockout added')
      onOpenChange(false)
      setRange(undefined)
      setReason('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-fit">
        <DialogHeader>
          <DialogTitle>Add blockout</DialogTitle>
          <DialogDescription>
            Dates you're unavailable — leaders see them when scheduling.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {accounts.length > 1 && (
            <div className="w-full max-w-[240px]">
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
            disabled={{ before: new Date() }}
            className="rounded-md border"
          />
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="bo-reason">Reason (optional)</Label>
            <Input
              id="bo-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Away on holidays"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={createBlockout.isPending || !range?.from}>
            {createBlockout.isPending && <Loader2 className="size-4 animate-spin" />}
            Add blockout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
