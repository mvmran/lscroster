import { useState } from 'react'
import { CalendarCheck, CalendarDays, Church, CircleUser, House, LogOut, Menu, Music, Settings, Users, UsersRound } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/use-auth'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { ChurchLogo } from '@/features/settings/church-logo'
import { useChurchSettings } from '@/features/settings/use-church-settings'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const navItems: {
  to: string
  label: string
  icon: typeof House
  /** Match exactly (NavLink `end`) so Home isn't active everywhere. */
  end?: boolean
}[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/my-schedule', label: 'My Schedule', icon: CalendarCheck },
  { to: '/people', label: 'People', icon: Users },
  { to: '/teams', label: 'Teams', icon: UsersRound },
  { to: '/services', label: 'Services', icon: CalendarDays },
  { to: '/songs', label: 'Songs', icon: Music },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-2">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )
          }
        >
          <Icon className="size-5 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function Brand({ className }: { className?: string }) {
  const { data: settings } = useChurchSettings()
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <ChurchLogo
        settings={settings}
        className="h-7 w-auto max-w-[120px]"
        fallback={<Church className="size-6 shrink-0" />}
      />
      <span className="truncate text-base font-semibold">
        {settings?.name ?? 'LSCRoster'}
      </span>
    </div>
  )
}

function UserMenu() {
  const { session } = useAuth()
  const { data: person } = useCurrentPerson()
  const navigate = useNavigate()

  const email = session?.user.email ?? ''
  const name = person ? `${person.first_name} ${person.last_name}` : email
  const initials = person
    ? `${person.first_name[0] ?? ''}${person.last_name[0] ?? ''}`.toUpperCase()
    : email.slice(0, 2).toUpperCase()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/signin', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-8">
            <AvatarFallback>{initials || '?'}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{name}</span>
            <span className="text-muted-foreground text-xs font-normal">
              {email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {person && (
          <DropdownMenuItem asChild>
            <Link to={`/people/${person.id}`}>
              <CircleUser className="size-4" />
              My profile
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="min-h-svh">
      {/* Desktop sidebar */}
      {/* pt aligns the first nav item's text with the page heading: header
          (h-14) + main top padding (md:p-6) − the nav link's own py-2.5. */}
      <aside className="bg-sidebar border-sidebar-border bg-gradient-to-b from-[var(--chrome-from)] to-[var(--chrome-to)] dark:bg-none fixed inset-y-0 left-0 z-30 hidden w-48 flex-col gap-6 border-r pt-[70px] pb-5 shadow-lg md:flex">
        <NavLinks />
      </aside>

      <div className="flex min-h-svh flex-col md:pl-48">
        {/* Topbar */}
        <header className="bg-gradient-to-r from-[var(--chrome-from)] to-[var(--chrome-to)] dark:bg-none dark:bg-background/95 dark:supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar bg-gradient-to-b from-[var(--chrome-from)] to-[var(--chrome-to)] dark:bg-none w-64 p-0">
              <SheetHeader className="px-2 pt-5 pb-0">
                <SheetTitle asChild>
                  <Brand className="px-4" />
                </SheetTitle>
              </SheetHeader>
              <div className="pt-4">
                <NavLinks onNavigate={() => setMobileNavOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Brand />
          <div className="flex-1" />
          <ModeToggle />
          <UserMenu />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
