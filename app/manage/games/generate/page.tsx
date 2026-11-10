import { AuthenticatedShell } from '@/components/authenticated-shell'
import { ScheduleGeneratorPage } from '@/components/schedule-generator-page'

export default function GenerateSchedulePage() {
  return <AuthenticatedShell title="Generate schedule"><ScheduleGeneratorPage /></AuthenticatedShell>
}
