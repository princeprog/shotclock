import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearOrganizationSelection, readOrganizationSelection, resolveSelectedOrganization, saveOrganizationSelection } from '../lib/organization-selection.ts'

test('the selected organization survives a page reload and clears at sign-out', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  saveOrganizationSelection('organization-b', storage)
  assert.equal(readOrganizationSelection(storage), 'organization-b')
  clearOrganizationSelection(storage)
  assert.equal(readOrganizationSelection(storage), '')
})

test('unavailable browser storage does not break selection flows', () => {
  const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
  assert.equal(readOrganizationSelection(storage), '')
  assert.doesNotThrow(() => saveOrganizationSelection('organization-a', storage))
  assert.doesNotThrow(() => clearOrganizationSelection(storage))
})

test('only uses the explicitly selected organization when it is still owned', () => {
  const organizations = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
  assert.equal(resolveSelectedOrganization(organizations, '', 'b')?.name, 'B')
  assert.equal(resolveSelectedOrganization(organizations, 'a', 'b')?.name, 'A')
  assert.equal(resolveSelectedOrganization(organizations, '', ''), undefined)
  assert.equal(resolveSelectedOrganization(organizations, 'missing', 'b'), undefined)
})
