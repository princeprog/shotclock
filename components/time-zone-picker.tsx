'use client'

import { useMemo, useState } from 'react'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { timeZoneOptions } from '@/lib/league-time'

// A searchable IANA time zone field. The hidden input lets plain forms submit the choice.
export function TimeZonePicker({ id, name, defaultValue, value: controlled, onChange, disabled, invalid }: { id: string; name?: string; defaultValue?: string | null; value?: string; onChange?: (value: string) => void; disabled?: boolean; invalid?: boolean }) {
  const zones = useMemo(() => timeZoneOptions(), [])
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? '')
  const value = controlled ?? uncontrolled
  return <>
    <Combobox items={zones} value={value || null} onValueChange={(next: string | null) => { setUncontrolled(next ?? ''); onChange?.(next ?? '') }} disabled={disabled}>
      <ComboboxInput id={id} placeholder="Search time zones" className="w-full" disabled={disabled} aria-invalid={invalid || undefined} />
      <ComboboxContent>
        <ComboboxEmpty>No matching time zones.</ComboboxEmpty>
        <ComboboxList>{(zone: string) => <ComboboxItem key={zone} value={zone}>{zone.replaceAll('_', ' ')}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
    {name && <input type="hidden" name={name} value={value} />}
  </>
}

