import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../lib/schedule-navigation-guard.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function setup(accept = false) {
  const events = new Map(); const documentEvents = new Map(); const pushes = []; let prompts = 0
  const window = { location: { href: 'http://localhost/manage/games/generate' }, history: { state: { key: 'page' }, pushState: (...args) => pushes.push(args) }, confirm: () => { prompts++; return accept }, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: (type) => events.delete(type) }
  const document = { addEventListener: (type, fn) => documentEvents.set(type, fn), removeEventListener: (type) => documentEvents.delete(type) }
  const context = { exports: {}, window, document, URL }
  vm.runInNewContext(compiled, context)
  const dispose = context.exports.installScheduleNavigationGuard(() => true)
  return { events, documentEvents, pushes, dispose, prompts: () => prompts }
}

test('blocks a navigation link when the organizer keeps the preview', () => {
  const h = setup(); let prevented = false
  const anchor = { href: 'http://localhost/manage/teams', target: '', hasAttribute: () => false }
  h.documentEvents.get('click')({ defaultPrevented: false, button: 0, target: { closest: () => anchor }, preventDefault: () => { prevented = true }, stopImmediatePropagation() {} })
  assert.equal(prevented, true); assert.equal(h.prompts(), 1)
  h.dispose(); assert.equal(h.events.size, 0); assert.equal(h.documentEvents.size, 0)
})

test('restores the current page when browser back is canceled', () => {
  const h = setup(); let stopped = false
  h.events.get('popstate')({ stopImmediatePropagation: () => { stopped = true } })
  assert.equal(stopped, true); assert.equal(h.pushes[0][2], 'http://localhost/manage/games/generate')
})

test('allows confirmed navigation and guards reloads', () => {
  const h = setup(true); let stopped = false; let prevented = false
  h.events.get('popstate')({ stopImmediatePropagation: () => { stopped = true } })
  h.events.get('beforeunload')({ preventDefault: () => { prevented = true }, returnValue: undefined })
  assert.equal(stopped, false); assert.equal(prevented, true)
})

test('keeps the preview when a workspace change is canceled', () => {
  const h = setup(); let prevented = false
  h.events.get('shotclock:before-workspace-change')({ preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
})

test('does not interrupt opening a link in a new tab', () => {
  const h = setup(); let prevented = false
  h.documentEvents.get('click')({ defaultPrevented: false, button: 0, ctrlKey: true, preventDefault: () => { prevented = true } })
  assert.equal(prevented, false); assert.equal(h.prompts(), 0)
})
