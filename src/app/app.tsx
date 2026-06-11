import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth } from '@/app/guards'
import { AppLayout } from '@/app/layout'
import { Providers } from '@/app/providers'
import { AcceptInvitePage } from '@/features/auth/accept-invite-page'
import { SetupPage } from '@/features/auth/setup-page'
import { SignInPage } from '@/features/auth/sign-in-page'
import { CreatePersonPage } from '@/features/people/create-person-page'
import { ImportPage } from '@/features/people/import-page'
import { PeoplePage } from '@/features/people/people-page'
import { PersonPage } from '@/features/people/person-page'
import { MySchedulePage } from '@/features/scheduling/my-schedule-page'
import { PlanPage } from '@/features/services/plan-page'
import { PlanPrintPage } from '@/features/services/plan-print-page'
import { ServicesPage } from '@/features/services/services-page'
import { ServiceTypesPage } from '@/features/services/service-types-page'
import { SongPage } from '@/features/services/song-page'
import { SongsPage } from '@/features/services/songs-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { UsersPage } from '@/features/settings/users-page'

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/invite/:token" element={<AcceptInvitePage />} />
          <Route element={<RequireAuth />}>
            {/* Print view: authenticated but outside the app shell. */}
            <Route path="/services/plans/:id/print" element={<PlanPrintPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/people" replace />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/people/:id" element={<PersonPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/services/plans/:id" element={<PlanPage />} />
              <Route path="/songs" element={<SongsPage />} />
              <Route path="/songs/:id" element={<SongPage />} />
              <Route path="/my-schedule" element={<MySchedulePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route element={<RequireAdmin />}>
                <Route path="/people/new" element={<CreatePersonPage />} />
                <Route path="/people/import" element={<ImportPage />} />
                <Route path="/settings/users" element={<UsersPage />} />
                <Route path="/settings/service-types" element={<ServiceTypesPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/people" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </Providers>
  )
}
