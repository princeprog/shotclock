import { test } from 'node:test'
import assert from 'node:assert/strict'
import { organizationPickerUrl, organizationReturnPath, shouldChooseOrganization } from '../lib/organization-navigation.ts'

test('redirects only after the organization list has successfully loaded without a selection', () => {
  assert.equal(shouldChooseOrganization('success', 'idle', false), true)
  assert.equal(shouldChooseOrganization('success', 'idle', true), false)
  assert.equal(shouldChooseOrganization('pending', 'fetching', false), false)
  assert.equal(shouldChooseOrganization('success', 'fetching', false), false)
  assert.equal(shouldChooseOrganization('success', 'paused', false), false)
  assert.equal(shouldChooseOrganization('error', 'idle', false), false)
})

test('returns to the requested management page with its filters after selection', () => {
  const picker = new URL(organizationPickerUrl('/manage/teams?search=lions#roster'), 'https://shotclock.test')
  assert.equal(picker.pathname, '/organizations')
  assert.equal(organizationReturnPath(picker.searchParams.get('returnTo')), '/manage/teams?search=lions#roster')
})

test('only permits local management pages as return destinations', () => {
  for (const value of [null, '', 'https://evil.test/manage/teams', '//evil.test/manage/teams', '/\\evil.test/manage/teams', '/login', '/manage/organizations', '/manage/../login']) {
    assert.equal(organizationReturnPath(value), '/', String(value))
  }
  assert.equal(organizationReturnPath('/manage/rosters/abc?view=all'), '/manage/rosters/abc?view=all')
})
