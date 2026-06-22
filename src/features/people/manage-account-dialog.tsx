import { useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fullName } from '@/features/people/person-utils'
import { usePeople } from '@/features/people/use-people'

/**
 * Picks an existing member to manage a person without their own login
 * (issue #89). Only active people who already have a sign-in account can be a
 * manager, since they need to log in to act on the managed person's behalf.
 */
export function ManageAccountDialog({
  open,
  onOpenChange,
  personId,
  personName,
  onChoose,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  personName: string
  onChoose: (managerId: string) => void
  saving: boolean
}) {
  const { data: people } = usePeople()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (people ?? [])
      .filter(
        (p) =>
          p.id !== personId &&
          p.status === 'active' &&
          p.auth_user_id !== null &&
          (term === '' || fullName(p).toLowerCase().includes(term)),
      )
      .slice(0, 100)
  }, [people, personId, search])

  function close(next: boolean) {
    if (!next) {
      setSearch('')
      setSelected(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a managing member</DialogTitle>
          <DialogDescription>
            Choose an existing member to manage {personName}. They'll be able to
            view and respond to {personName}'s roster from their own account.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members…"
          autoFocus
        />
        <div className="-mx-2 flex-1 overflow-y-auto px-2">
          {candidates.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No members with a sign-in account match.
            </p>
          ) : (
            <ul className="flex flex-col">
              {candidates.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={`hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${
                      selected === p.id ? 'bg-accent' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {fullName(p)}
                      </span>
                      {p.email && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {p.email}
                        </span>
                      )}
                    </span>
                    {selected === p.id && <Check className="text-primary size-4 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => selected && onChoose(selected)}
            disabled={!selected || saving}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
