import { Badge } from '@/components/ui/badge'

type SeasonStatus = 'draft' | 'active' | 'completed'

const variants = {
  draft: 'seasonDraft',
  active: 'seasonActive',
  completed: 'seasonCompleted',
} as const

export function SeasonStatusBadge({ status, includeSeason = false }: { status: SeasonStatus; includeSeason?: boolean }) {
  return <Badge variant={variants[status]} className="capitalize">{status}{includeSeason ? ' season' : ''}</Badge>
}
