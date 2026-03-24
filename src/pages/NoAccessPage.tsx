import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function NoAccessPage() {
  const { signOut, user } = useAuth()

  return (
    <div className="flex min-h-svh items-center justify-center bg-[var(--color-veera-bg)] px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>No admin access</CardTitle>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium">{user?.email ?? 'this account'}</span>, but this user does not
            have an admin role. Ask a super admin to add you in Team, or use a different account.
          </p>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
