import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FullPageLoader } from '@/components/full-page-loader'
import { RequireAdmin, RequireAdminOrLeader, RequireAuth } from '@/app/guards'
import { AppLayout } from '@/app/layout'
import { Providers } from '@/app/providers'
import { SignInPage } from '@/features/auth/sign-in-page'

// Route-level code splitting: each page loads on first visit, keeping the
// initial bundle (sign-in + shell) small.
const lazyPage = <T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  name: keyof T,
) =>
  lazy(async () => ({
    default: (await loader())[name] as React.ComponentType,
  }))

const SetupPage = lazyPage(() => import('@/features/auth/setup-page'), 'SetupPage')
const AcceptInvitePage = lazyPage(
  () => import('@/features/auth/accept-invite-page'),
  'AcceptInvitePage',
)
const ForgotPasswordPage = lazyPage(
  () => import('@/features/auth/forgot-password-page'),
  'ForgotPasswordPage',
)
const ResetPasswordPage = lazyPage(
  () => import('@/features/auth/reset-password-page'),
  'ResetPasswordPage',
)
const RespondPage = lazyPage(
  () => import('@/features/scheduling/respond-page'),
  'RespondPage',
)
const DashboardPage = lazyPage(
  () => import('@/features/dashboard/dashboard-page'),
  'DashboardPage',
)
const PeoplePage = lazyPage(() => import('@/features/people/people-page'), 'PeoplePage')
const PersonPage = lazyPage(() => import('@/features/people/person-page'), 'PersonPage')
const CreatePersonPage = lazyPage(
  () => import('@/features/people/create-person-page'),
  'CreatePersonPage',
)
const ImportPage = lazyPage(() => import('@/features/people/import-page'), 'ImportPage')
const ServicesPage = lazyPage(
  () => import('@/features/services/services-page'),
  'ServicesPage',
)
const PlanPage = lazyPage(() => import('@/features/services/plan-page'), 'PlanPage')
const PlanPrintPage = lazyPage(
  () => import('@/features/services/plan-print-page'),
  'PlanPrintPage',
)
const SongsPage = lazyPage(() => import('@/features/services/songs-page'), 'SongsPage')
const SongPage = lazyPage(() => import('@/features/services/song-page'), 'SongPage')
const SongReportsPage = lazyPage(
  () => import('@/features/services/song-reports-page'),
  'SongReportsPage',
)
const ServiceTypesPage = lazyPage(
  () => import('@/features/services/service-types-page'),
  'ServiceTypesPage',
)
const TeamsPage = lazyPage(() => import('@/features/scheduling/teams-page'), 'TeamsPage')
const TeamPage = lazyPage(() => import('@/features/scheduling/team-page'), 'TeamPage')
const MatrixPage = lazyPage(
  () => import('@/features/scheduling/matrix-page'),
  'MatrixPage',
)
const MySchedulePage = lazyPage(
  () => import('@/features/scheduling/my-schedule-page'),
  'MySchedulePage',
)
const SettingsPage = lazyPage(
  () => import('@/features/settings/settings-page'),
  'SettingsPage',
)
const UsersPage = lazyPage(() => import('@/features/settings/users-page'), 'UsersPage')
const EmailLogPage = lazyPage(
  () => import('@/features/settings/email-log-page'),
  'EmailLogPage',
)
const AuditLogPage = lazyPage(
  () => import('@/features/settings/audit-log-page'),
  'AuditLogPage',
)

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Suspense fallback={<FullPageLoader />}>
          <Routes>
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/invite/:token" element={<AcceptInvitePage />} />
            {/* Scheduling responses are answerable without logging in. */}
            <Route path="/respond/:token" element={<RespondPage />} />
            <Route element={<RequireAuth />}>
              {/* Print view: authenticated but outside the app shell. */}
              <Route path="/services/plans/:id/print" element={<PlanPrintPage />} />
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/people/:id" element={<PersonPage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/services/matrix" element={<MatrixPage />} />
                <Route path="/services/plans/:id" element={<PlanPage />} />
                <Route path="/songs" element={<SongsPage />} />
                <Route path="/songs/reports" element={<SongReportsPage />} />
                <Route path="/songs/:id" element={<SongPage />} />
                <Route path="/teams" element={<TeamsPage />} />
                <Route path="/teams/:id" element={<TeamPage />} />
                <Route path="/my-schedule" element={<MySchedulePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/people/new" element={<CreatePersonPage />} />
                  <Route path="/people/import" element={<ImportPage />} />
                  <Route path="/settings/users" element={<UsersPage />} />
                  <Route path="/settings/email-log" element={<EmailLogPage />} />
                  <Route path="/settings/audit" element={<AuditLogPage />} />
                </Route>
                <Route element={<RequireAdminOrLeader />}>
                  {/* Leaders manage service types too (issue #125). */}
                  <Route path="/settings/service-types" element={<ServiceTypesPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </Providers>
  )
}
