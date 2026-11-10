'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, Building2Icon, PlusIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'
import { organizationReturnPath } from '@/lib/organization-navigation'
import { saveOrganizationSelection } from '@/lib/organization-selection'
import { useAppDispatch } from '@/lib/store-hooks'
import { selectOrganization } from '@/lib/ui-slice'

type Organization = { id: string; name: string }

export function OrganizationPicker({ returnTo }: { returnTo?: string }) {
  const router = useRouter()
  const client = useQueryClient()
  const dispatch = useAppDispatch()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [editing, setEditing] = useState<Organization | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const organizations = useQuery({
    queryKey: ['league', 'organizations'],
    queryFn: () => leagueRequest<Organization[]>('organizations', client),
    retry: false,
  })

  function enterOrganization(organization: Organization) {
    saveOrganizationSelection(organization.id)
    dispatch(selectOrganization(organization.id))
    if (returnTo) router.replace(organizationReturnPath(returnTo))
    else router.push('/')
  }

  const createOrganization = useMutation({
    mutationFn: (organizationName: string) => leagueRequest<Organization>('organizations', client, 'POST', { name: organizationName }),
    onSuccess: (organization) => {
      enterOrganization(organization)
    },
  })

  const renameOrganization = useMutation({
    mutationFn: ({ id, name }: Organization) => leagueRequest<Organization>(`organizations/${id}`, client, 'PATCH', { name }),
    onSuccess: () => {
      setEditing(null)
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setNameError('Enter an organization name.'); return }
    setNameError('')
    createOrganization.mutate(trimmed)
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = editName.trim()
    if (!trimmed) { setEditError('Enter an organization name.'); return }
    if (editing) { setEditError(''); renameOrganization.mutate({ id: editing.id, name: trimmed }) }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pt-12 pb-16 sm:px-8 sm:pt-20">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Choose an organization</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{returnTo ? 'Select an organization to return to the page you were viewing, or create a new one to get started.' : 'Select an organization to manage its leagues and seasons, or create a new one to get started.'}</p>
      </div>

      <section aria-labelledby="organizations-heading" className="mt-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="organizations-heading" className="text-sm font-medium">Your organizations</h2>
          {!creating && !!organizations.data?.length && <Button variant="outline" onClick={() => setCreating(true)}><PlusIcon data-icon="inline-start" />Create organization</Button>}
        </div>

        {organizations.isPending && <div role="status" aria-label="Loading organizations" className="flex flex-col gap-2"><Skeleton className="h-18 w-full" /><Skeleton className="h-18 w-full" /></div>}
        {organizations.isError && <Alert variant="destructive"><AlertTitle>Couldn’t load your organizations</AlertTitle><AlertDescription><p>{organizations.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void organizations.refetch()}>Try again</Button></AlertDescription></Alert>}
        {organizations.data?.length === 0 && !creating && <Card><CardHeader><CardTitle>No organizations yet</CardTitle><CardDescription>Create an organization to start managing your first league.</CardDescription></CardHeader><CardContent><Button onClick={() => setCreating(true)} className="self-start"><PlusIcon data-icon="inline-start" />Create organization</Button></CardContent></Card>}
        {!!organizations.data?.length && <Card className="gap-0 py-0"><CardContent className="gap-0 px-0"><ul className="divide-y">{organizations.data.map((organization) => <li key={organization.id}>
          <div className="flex items-center gap-1 pr-3">
            <Button variant="ghost" onClick={() => enterOrganization(organization)} className="h-auto min-w-0 flex-1 justify-start gap-4 rounded-none px-5 py-4 text-left" aria-label={`Open ${organization.name}`}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Building2Icon aria-hidden="true" /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate font-medium">{organization.name}</span><span className="text-xs font-normal text-muted-foreground">Owner</span></span>
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" disabled={renameOrganization.isPending} aria-label={`Rename ${organization.name}`} aria-expanded={editing?.id === organization.id} onClick={() => { if (editing?.id === organization.id) { setEditing(null); renameOrganization.reset(); return }; setEditing(organization); setEditName(organization.name); setEditError(''); renameOrganization.reset(); setCreating(false) }}>Rename</Button>
          </div>
          {editing?.id === organization.id && <form onSubmit={submitRename} className="flex flex-col gap-4 px-5 pb-5">
            <Field data-invalid={!!editError || renameOrganization.isError}><FieldLabel htmlFor={`rename-${organization.id}`} required>Organization name</FieldLabel><Input id={`rename-${organization.id}`} value={editName} onChange={(event) => { setEditName(event.target.value); setEditError('') }} maxLength={120} required aria-invalid={!!editError || renameOrganization.isError} />{editError && <FieldError>{editError}</FieldError>}</Field>
            {renameOrganization.isError && <FieldError>{renameOrganization.error.message}</FieldError>}
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={renameOrganization.isPending}>{renameOrganization.isPending ? 'Saving…' : 'Save name'}</Button><Button type="button" size="sm" variant="ghost" disabled={renameOrganization.isPending} onClick={() => { setEditing(null); renameOrganization.reset() }}>Cancel</Button></div>
          </form>}
        </li>)}</ul></CardContent></Card>}

        {creating && <Card><CardHeader><CardTitle>Create an organization</CardTitle><CardDescription>Give your organization a name. You can change it later.</CardDescription></CardHeader><CardContent>
          <form onSubmit={submit} className="flex flex-col gap-5">
            <FieldGroup><Field data-invalid={!!nameError || createOrganization.isError}><FieldLabel htmlFor="organization-name" required>Organization name</FieldLabel><Input id="organization-name" value={name} onChange={(event) => { setName(event.target.value); setNameError('') }} autoComplete="organization" maxLength={120} required aria-invalid={!!nameError || createOrganization.isError} aria-describedby="organization-name-help" /><FieldDescription id="organization-name-help">For example, your association or club name.</FieldDescription>{nameError && <FieldError>{nameError}</FieldError>}</Field></FieldGroup>
            {createOrganization.isError && <FieldError>{createOrganization.error.message}</FieldError>}
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={createOrganization.isPending}>{createOrganization.isPending ? 'Creating…' : 'Create and continue'}</Button><Button type="button" variant="ghost" disabled={createOrganization.isPending} onClick={() => { setCreating(false); setNameError(''); createOrganization.reset() }}>Cancel</Button></div>
          </form>
        </CardContent></Card>}
      </section>
    </main>
  )
}
