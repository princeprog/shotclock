import { RestoringSession } from '@/components/restoring-session'

// Temporary preview of the restoring-session loader. Not committed.
export default function LoaderPreview() {
  return <main className="grid min-h-svh place-items-center gap-16 p-10 md:grid-cols-2">
    <section className="flex flex-col items-center gap-6"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Restore screen</p><RestoringSession /></section>
    <section className="flex flex-col items-center gap-6"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Login page</p><div className="w-full max-w-sm rounded-xl border"><RestoringSession size="inline" /></div></section>
  </main>
}
