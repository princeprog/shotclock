'use client'

import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { leagueRequest } from '@/lib/league-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Division = { id: string; season_id: string; name: string; min_age: number | null; max_age: number | null }
type Season = { id: string; name: string; status: 'draft' | 'active' | 'completed' }
type AgeRule = 'under' | 'and-up' | 'range'

export function DivisionsWorkspace({ season, divisions }: { season: Season; divisions: Division[] }) {
  const client = useQueryClient()
  const [editing, setEditing] = useState<Division | 'new' | null>(null)
  const [removing, setRemoving] = useState<Division | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [ageRule, setAgeRule] = useState<AgeRule>('under')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [rangeError, setRangeError] = useState('')
  const save = useMutation({
    mutationFn: (body: { name: string; minAge: number | null; maxAge: number | null }) => leagueRequest(editing === 'new' ? `seasons/${season.id}/divisions` : `divisions/${(editing as Division).id}`, client, editing === 'new' ? 'POST' : 'PATCH', body),
    onSuccess: () => { setEditing(null); toast.success('Division saved.') },
  })
  const remove = useMutation({
    mutationFn: (id: string) => leagueRequest(`divisions/${id}`, client, 'DELETE'),
    onSuccess: () => { setRemoving(null); toast.success('Division removed.') },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const min = !isOpen && ageRule !== 'under' ? Number(minAge) : null
    const max = !isOpen && ageRule !== 'and-up' ? Number(maxAge) : null
    if (min !== null && max !== null && min >= max) { setRangeError('Minimum age must be less than the upper age limit.'); return }
    setRangeError('')
    save.mutate({ name: String(data.get('name') ?? '').trim(), minAge: min, maxAge: max })
  }
  const selected = editing && editing !== 'new' ? editing : null
  return <section className="flex flex-col gap-4" aria-label={`${season.name} divisions`}>
    {season.status !== 'completed' && <div className="flex justify-end"><Button onClick={() => { save.reset(); setRangeError(''); setIsOpen(false); setAgeRule('under'); setMinAge(''); setMaxAge(''); setEditing('new') }}><PlusIcon data-icon="inline-start" />Add division</Button></div>}
    <Card className="gap-0 py-0"><CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-5">Division</TableHead><TableHead>Age limit</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{divisions.map((item) => <TableRow key={item.id}><TableCell className="pl-5 font-medium">{item.name}</TableCell><TableCell>{item.min_age !== null && item.max_age !== null ? `${item.min_age} to ${item.max_age - 1}` : item.min_age !== null ? `${item.min_age} and up` : item.max_age !== null ? `Under ${item.max_age}` : 'No limit'}</TableCell><TableCell className="text-right">{season.status !== 'completed' && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`} onClick={() => { save.reset(); setRangeError(''); setIsOpen(item.min_age === null && item.max_age === null); setAgeRule(item.min_age !== null && item.max_age !== null ? 'range' : item.min_age !== null ? 'and-up' : 'under'); setMinAge(item.min_age === null ? '' : String(item.min_age)); setMaxAge(item.max_age === null ? '' : String(item.max_age)); setEditing(item) }}><PencilIcon /></Button>}{season.status === 'draft' && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.name}`} onClick={() => { remove.reset(); setRemoving(item) }}><Trash2Icon /></Button>}</TableCell></TableRow>)}</TableBody></Table>{!divisions.length && <p className="p-5 text-sm text-muted-foreground">No divisions found for this season.</p>}</CardContent></Card>
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !save.isPending) setEditing(null) }}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto"><DialogHeader><DialogTitle>{selected ? 'Edit division' : 'Add division'}</DialogTitle><DialogDescription>{isOpen ? 'Open divisions have no age limit.' : 'Age eligibility is based on the season start date.'}</DialogDescription></DialogHeader><form onSubmit={submit} className="flex flex-col gap-4"><Field><FieldLabel htmlFor="division-name" required>Name</FieldLabel><Input id="division-name" name="name" defaultValue={selected?.name ?? ''} required maxLength={120} disabled={save.isPending} /></Field><Field orientation="horizontal"><div className="flex-1"><FieldLabel htmlFor="division-open">Open division</FieldLabel><FieldDescription>Allow players of any age.</FieldDescription></div><Switch id="division-open" checked={isOpen} onCheckedChange={(checked) => { setIsOpen(checked); setRangeError('') }} disabled={save.isPending} /></Field>{!isOpen && <><Field><FieldLabel htmlFor="division-age-rule" required>Age rule</FieldLabel><Select value={ageRule} onValueChange={(value) => { if (value === 'under' || value === 'and-up' || value === 'range') { setAgeRule(value); setRangeError('') } }} disabled={save.isPending} items={[{ value: 'under', label: 'Under an age' }, { value: 'and-up', label: 'Age and up' }, { value: 'range', label: 'Age range' }]}><SelectTrigger id="division-age-rule" aria-required="true" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="under">Under an age</SelectItem><SelectItem value="and-up">Age and up</SelectItem><SelectItem value="range">Age range</SelectItem></SelectGroup></SelectContent></Select></Field>{ageRule !== 'under' && <Field><FieldLabel htmlFor="division-min-age" required>Minimum age</FieldLabel><Input id="division-min-age" name="minAge" type="number" min={1} max={150} step={1} value={minAge} onChange={(event) => { setMinAge(event.target.value); setRangeError('') }} required disabled={save.isPending} aria-invalid={!!rangeError} aria-describedby={rangeError ? 'division-age-error' : undefined} /><FieldDescription>Players must be at least this age.</FieldDescription></Field>}{ageRule !== 'and-up' && <Field><FieldLabel htmlFor="division-max-age" required>{ageRule === 'range' ? 'Under age' : 'Age limit'}</FieldLabel><Input id="division-max-age" name="maxAge" type="number" min={1} max={150} step={1} value={maxAge} onChange={(event) => { setMaxAge(event.target.value); setRangeError('') }} required disabled={save.isPending} aria-invalid={!!rangeError} aria-describedby={rangeError ? 'division-age-error' : undefined} /><FieldDescription>Players must be younger than this age.</FieldDescription></Field>}{rangeError && <p id="division-age-error" role="alert" className="text-sm text-destructive">{rangeError}</p>}</>}{save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}<DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save division'}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={removing !== null} onOpenChange={(open) => { if (!open && !remove.isPending) setRemoving(null) }}><DialogContent><DialogHeader><DialogTitle>Remove {removing?.name}?</DialogTitle><DialogDescription>Only empty divisions in draft seasons can be removed.</DialogDescription></DialogHeader>{remove.isError && <p role="alert" className="text-sm text-destructive">{remove.error.message}</p>}<DialogFooter><Button variant="outline" disabled={remove.isPending} onClick={() => setRemoving(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (removing) remove.mutate(removing.id) }}>{remove.isPending ? 'Removing…' : 'Remove division'}</Button></DialogFooter></DialogContent></Dialog>
  </section>
}
