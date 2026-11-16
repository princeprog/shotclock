'use client'

import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { leagueRequest } from '@/lib/league-client'
import { slugError, suggestSlug, websiteUrl } from '@/lib/league-website'

export type WebsiteLeague = { id: string; name: string; slug?: string | null; published_at?: string | null }

// Publishes a league on the public Shotclock website and sets its web address.
export function LeagueWebsiteDialog({ league, onClose }: { league: WebsiteLeague | null; onClose: () => void }) {
  return <Dialog open={league !== null} onOpenChange={(open) => { if (!open) onClose() }}>
    {league && <WebsiteForm key={league.id} league={league} onClose={onClose} />}
  </Dialog>
}

function WebsiteForm({ league, onClose }: { league: WebsiteLeague; onClose: () => void }) {
  const client = useQueryClient()
  const wasPublished = !!league.published_at
  const [published, setPublished] = useState(wasPublished)
  const [slug, setSlug] = useState(league.slug ?? suggestSlug(league.name))
  const [touched, setTouched] = useState(false)
  const error = slugError(slug)
  const save = useMutation({
    mutationFn: (body: { published: boolean; slug: string }) => leagueRequest(`leagues/${league.id}/publication`, client, 'PATCH', body),
    onSuccess: () => {
      toast.success(published === wasPublished ? 'Website settings saved.' : published ? `${league.name} is now on the website.` : `${league.name} is hidden from the website.`)
      onClose()
    },
  })
  const addressChanged = wasPublished && !!league.slug && slug !== league.slug

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTouched(true)
    if (error) { document.getElementById('league-website-slug')?.focus(); return }
    save.mutate({ published, slug })
  }

  return <DialogContent showCloseButton={!save.isPending}>
    <DialogHeader>
      <DialogTitle>Website settings</DialogTitle>
      <DialogDescription>Choose whether {league.name} appears on the public Shotclock website.</DialogDescription>
    </DialogHeader>
    <form onSubmit={submit} className="flex flex-col gap-6">
      <FieldGroup className="gap-5">
        <Field orientation="horizontal">
          <div className="flex-1">
            <FieldLabel htmlFor="league-website-published">Show on public website</FieldLabel>
            <FieldDescription>Anyone can see schedules, results, standings and team stats for active and completed seasons. Player names and details stay private.</FieldDescription>
          </div>
          <Switch id="league-website-published" checked={published} onCheckedChange={setPublished} disabled={save.isPending} />
        </Field>
        <Field data-invalid={touched && !!error}>
          <FieldLabel htmlFor="league-website-slug">Web address</FieldLabel>
          <Input id="league-website-slug" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} onBlur={() => setTouched(true)} maxLength={60} autoComplete="off" spellCheck={false} disabled={save.isPending} aria-invalid={touched && !!error} aria-describedby="league-website-slug-preview" />
          <FieldDescription id="league-website-slug-preview" className="break-all">{websiteUrl()}/leagues/{slug || '…'}</FieldDescription>
          {touched && error && <FieldError>{error}</FieldError>}
          {addressChanged && !error && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">Links people already shared with the old address will stop working.</p>}
        </Field>
      </FieldGroup>
      {save.isError && <FieldError>{save.error.message}</FieldError>}
      <DialogFooter className="sm:justify-between">
        {wasPublished && league.slug
          ? <Button variant="ghost" nativeButton={false} render={<a href={`${websiteUrl()}/leagues/${league.slug}`} target="_blank" rel="noopener noreferrer" />}><ExternalLinkIcon data-icon="inline-start" />View on website</Button>
          : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </DialogFooter>
    </form>
  </DialogContent>
}
