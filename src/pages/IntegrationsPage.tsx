import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function IntegrationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Placeholder for future API keys, webhooks, and shared Supabase Edge Functions used by both this admin panel and
          the mobile app.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming later</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            Configuration and secrets for third-party services belong on the server (Supabase secrets, Edge Functions,
            or your backend)—never in this browser app.
          </p>
          <p>When you add integrations, this page can show status and safe, non-secret metadata only.</p>
        </CardContent>
      </Card>
    </div>
  )
}
