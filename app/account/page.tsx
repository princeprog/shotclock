import { AuthenticatedShell } from '@/components/authenticated-shell'
import { AccountSettings } from '@/components/account-settings'

export default function AccountPage() {
  return <AuthenticatedShell title="Account">
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 p-4 md:p-8">
      <div className="flex flex-col gap-1"><h1 className="text-2xl font-semibold tracking-tight">Account settings</h1><p className="text-sm text-muted-foreground">Manage how you sign in to Shotclock.</p></div>
      <AccountSettings />
    </main>
  </AuthenticatedShell>
}

