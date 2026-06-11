import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/app/guards'
import { AppLayout } from '@/app/layout'
import { Providers } from '@/app/providers'
import { SetupPage } from '@/features/auth/setup-page'
import { SignInPage } from '@/features/auth/sign-in-page'
import { PeoplePage } from '@/features/people/people-page'
import { MySchedulePage } from '@/features/scheduling/my-schedule-page'
import { ServicesPage } from '@/features/services/services-page'
import { SettingsPage } from '@/features/settings/settings-page'

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/services" replace />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/my-schedule" element={<MySchedulePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/services" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </Providers>
  )
}
