import { AuthenticatedShell } from '@/components/authenticated-shell'
import { ScheduleGeneratorPage } from '@/components/schedule-generator-page'

export default function SchedulePlayoffsPage() {
  return <AuthenticatedShell title="Schedule playoffs"><ScheduleGeneratorPage mode="playoffs" /></AuthenticatedShell>
}
