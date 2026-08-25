import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CalendarDays, Check, Loader2, Mail, ScrollText, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AppVersion } from '@/components/app-version'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/use-auth'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import {
  logoPublicUrl,
  useClearChurchLogo,
  useUploadChurchLogo,
  type LogoVariant,
} from '@/features/settings/use-church-logo'
import { CommunicationsSetupCard } from '@/features/settings/communications-setup-card'
import { ProjectionApiCard } from '@/features/settings/projection-api-card'
import {
  useChurchSettings,
  useUpdateChurchSettings,
} from '@/features/settings/use-church-settings'
import {
  applyBrandHue,
  BRAND_PRESETS,
  presetName,
} from '@/lib/brand'
import { invokeFunction } from '@/lib/functions'
import { cn } from '@/lib/utils'

type ChurchSettings = NonNullable<ReturnType<typeof useChurchSettings>['data']>

const MAX_LOGO_BYTES = 5 * 1024 * 1024

/**
 * One logo upload tile (issue #58). Empty tiles label themselves ("Light theme"
 * / "Dark theme") and the label gives way to the image once a logo is uploaded,
 * mirroring how the avatar shows initials until a photo is set.
 */
function LogoField({
  settings,
  variant,
}: {
  settings: ChurchSettings
  variant: LogoVariant
}) {
  const upload = useUploadChurchLogo()
  const clear = useClearChurchLogo()
  const fileRef = useRef<HTMLInputElement>(null)

  const path = variant === 'light' ? settings.logo_url : settings.logo_dark_url
  const url = logoPublicUrl(path)
  const label = variant === 'light' ? 'Light theme' : 'Dark theme'
  const dark = variant === 'dark'

  function onChosen(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo must be under 5 MB')
      return
    }
    upload.mutate(
      { settingsId: settings.id, variant, file, currentPath: path },
      {
        onSuccess: () => toast.success(`${label} logo updated`),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        className={cn(
          'flex h-24 w-full items-center justify-center rounded-lg border transition-colors',
          dark
            ? 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800'
            : 'border-zinc-200 bg-white hover:bg-zinc-50',
        )}
        aria-label={`Upload ${label.toLowerCase()} logo`}
      >
        {upload.isPending ? (
          <Loader2
            className={cn('size-5 animate-spin', dark ? 'text-zinc-400' : 'text-zinc-500')}
          />
        ) : url ? (
          <img src={url} alt={`${label} logo`} className="max-h-20 max-w-full object-contain p-2" />
        ) : (
          <span className={cn('text-xs', dark ? 'text-zinc-400' : 'text-muted-foreground')}>
            {label} logo
          </span>
        )}
      </button>
      {url && !upload.isPending && (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute -top-2 -right-2 size-6 rounded-full border shadow-sm"
          aria-label={`Remove ${label.toLowerCase()} logo`}
          disabled={clear.isPending}
          onClick={() =>
            clear.mutate(
              { settingsId: settings.id, variant, currentPath: path },
              {
                onSuccess: () => toast.success(`${label} logo removed`),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          <X className="size-3.5" />
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChosen(e.target.files?.[0])}
      />
    </div>
  )
}

/**
 * Accent colour picker (Phase 5). Every branded token derives from one oklch
 * hue, so a swatch grid is the whole feature — clicking one previews it live
 * across the app; it only persists when the form is saved.
 */
function AccentField({
  hue,
  onChange,
}: {
  hue: number
  onChange: (hue: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Accent colour</Label>
      <p className="text-muted-foreground text-xs">
        Tints buttons, links and the sidebar throughout the app — currently{' '}
        <span className="font-medium">{presetName(hue)}</span>. Changes preview
        immediately and apply for everyone once saved.
      </p>
      <div className="flex flex-wrap gap-2">
        {BRAND_PRESETS.map((preset) => {
          const selected = preset.hue === hue
          return (
            <button
              key={preset.hue}
              type="button"
              onClick={() => onChange(preset.hue)}
              aria-label={preset.name}
              aria-pressed={selected}
              title={preset.name}
              className={cn(
                'flex size-9 items-center justify-center rounded-full transition',
                'ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                selected
                  ? 'ring-foreground ring-2 ring-offset-2'
                  : 'hover:scale-110',
              )}
              style={{ backgroundColor: `oklch(0.51 0.22 ${preset.hue})` }}
            >
              {selected && <Check className="size-4 text-white" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ChurchSettingsForm({ settings }: { settings: ChurchSettings }) {
  const updateSettings = useUpdateChurchSettings()
  const [name, setName] = useState(settings.name)
  const [address, setAddress] = useState(settings.address ?? '')
  const [hue, setHue] = useState(settings.brand_hue)
  const savedHue = useRef(settings.brand_hue)

  const dirty =
    name.trim() !== settings.name ||
    address.trim() !== (settings.address ?? '') ||
    hue !== settings.brand_hue

  // Preview the accent live, and put the saved one back if the admin navigates
  // away without saving.
  useEffect(() => {
    applyBrandHue(hue)
  }, [hue])
  useEffect(() => {
    const saved = savedHue.current
    return () => applyBrandHue(saved)
  }, [])

  function save() {
    updateSettings.mutate(
      {
        id: settings.id,
        values: {
          name: name.trim(),
          address: address.trim() || null,
          brand_hue: hue,
        },
      },
      {
        onSuccess: () => toast.success('Church details saved'),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="church-name">Name</Label>
        <Input
          id="church-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Church logo</Label>
        <p className="text-muted-foreground text-xs">
          Shown in the app header and on the sign-in page. Upload a light- and a
          dark-theme version; if you upload only one, it's used for both.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LogoField settings={settings} variant="light" />
          <LogoField settings={settings} variant="dark" />
        </div>
      </div>
      <AccentField hue={hue} onChange={setHue} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="church-address">Address</Label>
        <Textarea
          id="church-address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 12 Example St, Sydney NSW 2000"
        />
      </div>
      <dl className="text-sm">
        <dt className="text-muted-foreground">Timezone</dt>
        <dd className="font-medium">{settings.timezone}</dd>
      </dl>
      {dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={updateSettings.isPending || !name.trim()}
            onClick={save}
          >
            {updateSettings.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      )}
    </div>
  )
}

function ChurchSettingsCard({ canEdit }: { canEdit: boolean }) {
  const { data: settings, isPending } = useChurchSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Church</CardTitle>
        <CardDescription>
          {canEdit
            ? 'Your church name, logo, accent colour and address. The address appears on plan-publish emails.'
            : 'Instance configuration created by the setup wizard.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending || !settings ? (
          <Skeleton className="h-16 w-full" />
        ) : canEdit ? (
          <ChurchSettingsForm key={settings.updated_at} settings={settings} />
        ) : (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{settings.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd className="font-medium">{settings.timezone}</dd>
            </div>
            {settings.address && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-medium whitespace-pre-line">
                  {settings.address}
                </dd>
              </div>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}

function TestEmailCard({ isAdmin }: { isAdmin: boolean }) {
  const { session } = useAuth()
  const email = session?.user.email

  const sendTest = useMutation({
    mutationFn: () =>
      invokeFunction<{ ok: boolean; id: string }>('send-email', {
        to: email,
        template: 'test',
      }),
    onSuccess: () => toast.success(`Test email sent to ${email}`),
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email delivery</CardTitle>
        <CardDescription>
          Sends a test email to your address ({email}) through the send-email
          Edge Function and Resend. Use this to verify email is configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          onClick={() => sendTest.mutate()}
          disabled={sendTest.isPending || !email}
          variant="outline"
        >
          {sendTest.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Mail className="size-4" />
          )}
          Send test email
        </Button>
        {isAdmin && (
          <Button asChild variant="ghost">
            <Link to="/settings/email-log">View email log</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function ServiceTypesLinkCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Service types</CardTitle>
        <CardDescription>
          The recurring gatherings you plan services for, e.g. “Sunday 10am”.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/settings/service-types">
            <CalendarDays className="size-4" />
            Manage service types
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function AuditLogCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          A record of who added, archived, deleted or re-roled people, and team
          membership and leader/viewer changes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/settings/audit">
            <ScrollText className="size-4" />
            View audit log
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { data: person } = useCurrentPerson()
  const isAdmin = person?.role === 'admin'
  // Leaders can manage service types too (issue #125) and send email.
  const canManageServiceTypes = isAdmin || person?.role === 'leader'
  const canSendEmail = isAdmin || person?.role === 'leader'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <ChurchSettingsCard canEdit={isAdmin} />
      {canManageServiceTypes && <ServiceTypesLinkCard />}
      {isAdmin && <CommunicationsSetupCard />}
      {isAdmin && <ProjectionApiCard />}
      {canSendEmail && <TestEmailCard isAdmin={isAdmin} />}
      {isAdmin && <AuditLogCard />}
      <AppVersion />
    </div>
  )
}
