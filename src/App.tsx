import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { AdminSignupPage } from '@/pages/AdminSignupPage'
import { NoAccessPage } from '@/pages/NoAccessPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { PlantsPage } from '@/pages/PlantsPage'
import { PlantNewPage } from '@/pages/PlantNewPage'
import { PlantDetailPage } from '@/pages/PlantDetailPage'
import { TagsPage } from '@/pages/TagsPage'
import { ImportPage } from '@/pages/ImportPage'
import { TeamPage } from '@/pages/TeamPage'
import { IntegrationsPage } from '@/pages/IntegrationsPage'

function Protected({ children }: { children: ReactNode }) {
  const { session, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-slate-600">
        Checking session…
      </div>
    )
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (!isAdmin) {
    return <NoAccessPage />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<AdminSignupPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="plants" element={<PlantsPage />} />
          <Route path="plants/new" element={<PlantNewPage />} />
          <Route path="plants/:id" element={<PlantDetailPage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="team" element={<TeamPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
