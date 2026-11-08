import { AuthenticatedShell } from "@/components/authenticated-shell"
import { LeagueWorkspace } from "@/components/league-workspace"

export default function Page() {
  return (
    <AuthenticatedShell>
      <LeagueWorkspace section="dashboard" />
    </AuthenticatedShell>
  )
}
