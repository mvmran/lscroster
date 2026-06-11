import { useState } from 'react'
import { CalendarCheck, CalendarDays, Church, LogOut, Menu, Settings, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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
import { useChurchSettings } from '@/features/settings/use-church-settings'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/people', label: 'People', icon: Users },
  { to: '/services', label: 'Services', icon: CalendarDays },
  { to: '/my-schedule', label: 'My Schedule', icon: CalendarCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-2">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
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

function Brand() {
  const { data: settings } = useChurchSettings()
  return (
    <div className="flex items-center gap-2 px-4">
      <Church className="size-6 shrink-0" />
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
      <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 border-r py-5 md:flex">
        <Brand />
        <NavLinks />
      </aside>

      <div className="flex min-h-svh flex-col md:pl-60">
        {/* Topbar */}
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
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
            <SheetContent side="left" className="bg-sidebar w-64 p-0">
              <SheetHeader className="px-2 pt-5 pb-0">
                <SheetTitle asChild>
                  <Brand />
                </SheetTitle>
              </SheetHeader>
              <div className="pt-4">
                <NavLinks onNavigate={() => setMobileNavOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

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
