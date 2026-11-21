import { redirect } from 'next/navigation'

// Playoffs are scheduled with the round robin on the Generate schedule page.
export default function SchedulePlayoffsPage() {
  redirect('/manage/games/generate')
}

