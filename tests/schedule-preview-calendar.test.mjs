import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/schedule-preview-calendar.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
function nodes(element) {
  if (element == null || typeof element === 'boolean') return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  if (typeof element !== 'object') return [element]
  return [element, ...nodes(element.props?.children)]
}
function render(props) {
  const context = { exports: {}, window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }, require(name) {
    if (name === 'react') return { useState: (initial) => [initial, () => {}], useSyncExternalStore: (_subscribe, client) => client() }
    if (name === '@dnd-kit/core') return { DndContext: 'DndContext', KeyboardSensor: 'KeyboardSensor', PointerSensor: 'PointerSensor', useSensor: (sensor, options) => ({ sensor, options }), useSensors: (...sensors) => sensors, useDraggable() {}, useDroppable() {} }
    if (name === '@dnd-kit/utilities') return { CSS: { Translate: { toString: () => undefined } } }
    if (name === 'lucide-react' || name.startsWith('@/components/ui/')) return new Proxy({}, { get: (_target, key) => key })
    return require(name)
  } }
  vm.runInNewContext(compiled, context)
  return nodes(context.exports.SchedulePreviewCalendar(props))
}
const base = { games: [{ index: 0, localTime: '2026-01-05T09:00', homeName: 'A', awayName: 'B', divisionName: 'Open', venueName: 'Court', conflict: false }, { index: 1, localTime: '2026-01-06T10:00', homeName: 'C', awayName: 'D', divisionName: 'Open', venueName: 'Court', conflict: true }],
  bookings: [], loading: false, error: '', onRetry() {}, initialDate: '2026-01-05', rangeStart: '2026-01-01', rangeEnd: '2026-01-31', timeZone: 'Asia/Manila', onSelect() {} }

test('dropping a proposed game on another day moves it to that day', () => {
  const moves = []
  const tree = render({ ...base, onMove: (index, day) => moves.push([index, day]) })
  const context = tree.find((n) => n.type === 'DndContext')
  context.props.onDragEnd({ active: { data: { current: { index: 1 } } }, over: { id: '2026-01-08' } })
  context.props.onDragEnd({ active: { data: { current: { index: 0 } } }, over: { id: '2026-01-05' } })
  context.props.onDragEnd({ active: { data: { current: { index: 0 } } }, over: null })
  assert.deepEqual(moves, [[1, '2026-01-08']])
  assert.match(context.props.accessibility.screenReaderInstructions.draggable, /Enter to edit.*Space/)
  const keyboard = context.props.sensors.find((item) => item.sensor === 'KeyboardSensor')
  assert.deepEqual(Array.from(keyboard.options.keyboardCodes.start), ['Space'])
})

test('week view columns and games are drag targets only when moving is supported', () => {
  const movable = render({ ...base, onMove() {} })
  assert.ok(movable.filter((n) => n.type?.name === 'DayColumn').every((n) => n.props.droppable === true))
  assert.ok(movable.filter((n) => n.type?.name === 'DraggableGame').every((n) => n.props.draggable === true))
  const fixed = render(base)
  assert.ok(fixed.filter((n) => n.type?.name === 'DraggableGame').every((n) => n.props.draggable === false))
})

