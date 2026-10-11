import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Goal, GoalState, Step, StepStatus } from '../types'

// One goal per project, kept across sessions in $.store, with a short history.
const PANE = 'goal'
const TITLE = 'Goal'
const state = atom({ plugin: 'goal', key: 'state' } as const, { root: '', goal: null, previous: [] })
const expanded = atom({ plugin: 'goal', key: 'expanded' } as const, false)

const MAX_PREVIOUS = 5
const MAX_STEPS = 12
const storeKey = (root: string) => `goal:${root}`

const GUIDE = [
  'Goal pane (the `goal` plugin): the person sees the overall goal you are working toward in a pane beside the chat — its title, a one-line summary, why it matters, and its steps with progress.',
  '- When the work has a goal bigger than one reply (a feature, a fix across files, a release), call `mcp__goal__set` with a title of a few words, a one-line summary of the outcome, `why` in a line, and the steps (3 to 8, a few words each). Set it again when the goal changes; the old one moves to history.',
  '- As you start and finish steps, call `mcp__goal__step` with the step number (1-based) and "doing" or "done". When every step is done the goal shows as complete.',
  '- `mcp__goal__get` returns the goal; read it after a context summary or at the start of a session to pick the work up again.',
  '- "Re [goal]" in a prompt is the person discussing the goal.',
].join('\n')

const oneLine = (s: string | undefined, max: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

const mark = (s: StepStatus) => (s === 'done' ? '✓' : s === 'doing' ? '▶' : '○')
const doneCount = (g: Goal) => g.steps.filter(s => s.status === 'done').length
const isComplete = (g: Goal) => g.steps.length > 0 && doneCount(g) === g.steps.length

function bar(done: number, total: number, width: number): string {
  if (total === 0) return ''
  const n = Math.max(4, Math.min(width, 20))
  const full = Math.round((done / total) * n)
  return '▰'.repeat(full) + '▱'.repeat(n - full)
}

/** The goal as plain text, for the get tool and the session's prompt. */
function describe(g: Goal): string {
  const lines = [`Goal: ${g.title}${isComplete(g) ? ' (complete)' : ''}`]
  if (g.summary) lines.push(`Summary: ${g.summary}`)
  if (g.why) lines.push(`Why: ${g.why}`)
  if (g.steps.length) {
    lines.push(`Steps (${doneCount(g)}/${g.steps.length} done):`)
    g.steps.forEach((s, i) => lines.push(`${i + 1}. ${mark(s.status)} ${s.title}`))
  }
  return lines.join('\n')
}

// Applies `fn` to the state and persists it.
async function change($: EngineInterface, fn: (prev: GoalState) => GoalState): Promise<GoalState> {
  let saved: GoalState = { root: '', goal: null, previous: [] }
  await update($, state, prev => {
    saved = fn(prev)
    return saved
  })
  await $.store.set(storeKey(saved.root), { goal: saved.goal, previous: saved.previous })
  return saved
}

async function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const root = await $.session.root()
    const stored = (await $.store.get(storeKey(root))) as Pick<GoalState, 'goal' | 'previous'> | undefined
    await update($, state, () => ({ root, goal: stored?.goal ?? null, previous: stored?.previous ?? [] }))

    await $.command.register({
      name: 'goal',
      description: 'Show or hide the pane with the overall goal',
    })
    await $.tool.register({
      name: 'set',
      description:
        'Sets the overall goal shown on the Goal pane: what you are working toward, why, and its steps. Replaces the current goal, which moves to history.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A few words naming the goal' },
          summary: { type: 'string', description: 'One line: the outcome when it is done (about 120 characters)' },
          why: { type: 'string', description: 'One line: why it matters' },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'The steps toward it, 3 to 8, a few words each, in order',
          },
          done: {
            type: 'integer',
            description: 'Optional: how many of the leading steps are already done',
          },
        },
        required: ['title'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'step',
      description: 'Marks a step of the goal on the Goal pane as doing, done or todo.',
      inputSchema: {
        type: 'object',
        properties: {
          step: { type: 'integer', description: 'The step number, 1-based' },
          status: { type: 'string', enum: ['doing', 'done', 'todo'] },
        },
        required: ['step', 'status'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'get',
      description: 'Returns the overall goal on the Goal pane, with its steps and progress.',
      isDeferred: false,
    })

    if (stored?.goal && !isComplete(stored.goal)) void openPane($)

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const g = (await read($, state)).goal
    const text = g && !isComplete(g) ? `${GUIDE}\n\nThe goal as this session started (call get for the latest):\n${describe(g)}` : GUIDE
    return {
      ...composed,
      sections: [...composed.sections, { id: 'goal:guide', text, scope: 'session' as const }],
    }
  })

  on('command.run', { command: 'goal' }, async $ => {
    const isUp = (await $.ui.panes()).some(p => p.id === PANE)
    if (isUp) {
      await $.ui.close({ id: PANE })
      return { text: 'Goal pane closed.' }
    }
    await openPane($)
    return { text: 'Goal pane opened.' }
  })

  on('tool.call', { tool: 'mcp__goal__set' }, async ($, e) => {
    const input = e as unknown as { title?: string; summary?: string; why?: string; steps?: unknown; done?: number }
    const title = oneLine(input.title, 80)
    if (!title) return { deny: 'goal: a title is required.' }
    const lead = Math.max(0, Math.floor(Number(input.done) || 0))
    const steps: Step[] = (Array.isArray(input.steps) ? input.steps : [])
      .map(s => oneLine(String(s), 80))
      .filter(Boolean)
      .slice(0, MAX_STEPS)
      .map((s, i) => ({ title: s, status: i < lead ? 'done' : 'todo' }))
    const now = await $.clock.now()
    const saved = await change($, prev => {
      const same = prev.goal?.title === title
      const goal: Goal = {
        title,
        summary: input.summary ? oneLine(input.summary, 300) : same ? prev.goal?.summary : undefined,
        why: input.why ? oneLine(input.why, 300) : same ? prev.goal?.why : undefined,
        steps: steps.length || !same ? steps : (prev.goal?.steps ?? []),
        setAt: same ? (prev.goal?.setAt ?? now) : now,
        changedAt: now,
      }
      const previous = prev.goal && !same ? [prev.goal, ...prev.previous].slice(0, MAX_PREVIOUS) : prev.previous
      return { root: prev.root, goal, previous }
    })
    void openPane($)
    return { result: `Goal set: ${title} (${saved.goal?.steps.length ?? 0} steps).` }
  })
    .catch(() => ({ deny: 'goal: the set tool failed.' }))

  on('tool.call', { tool: 'mcp__goal__step' }, async ($, e) => {
    const { step, status } = e as unknown as { step: number; status: StepStatus }
    const g = (await read($, state)).goal
    if (!g) return { result: 'No goal is set; call set first.' }
    const i = Math.floor(Number(step)) - 1
    if (!(i >= 0 && i < g.steps.length)) return { result: `No step ${step}; the goal has ${g.steps.length}.` }
    if (!['doing', 'done', 'todo'].includes(status)) return { deny: 'goal: status is doing, done or todo.' }
    const now = await $.clock.now()
    const saved = await change($, prev => {
      if (!prev.goal) return prev
      // One step is in progress at a time.
      const steps = prev.goal.steps.map((s, n): Step => {
        if (n === i) return { ...s, status }
        return status === 'doing' && s.status === 'doing' ? { ...s, status: 'todo' } : s
      })
      return { ...prev, goal: { ...prev.goal, steps, changedAt: now } }
    })
    const done = saved.goal ? doneCount(saved.goal) : 0
    const total = saved.goal?.steps.length ?? 0
    return { result: done === total ? `Step ${i + 1} ${status}. Goal complete.` : `Step ${i + 1} ${status}. ${done}/${total} done.` }
  })
    .catch(() => ({ deny: 'goal: the step tool failed.' }))

  on('tool.call', { tool: 'mcp__goal__get' }, async $ => {
    const g = (await read($, state)).goal
    return { result: g ? describe(g) : 'No goal is set.' }
  })
    .catch(() => ({ deny: 'goal: the get tool failed.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, state)
    const more = await read($, expanded)
    const width = Math.max(20, (e.props.bodyColumns ?? 40) - 2)
    const g = s.goal

    if (!g) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No goal set. Claude sets one when it starts on a larger piece of work.</Text>
        </Box>
      )
    }

    const done = doneCount(g)
    const total = g.steps.length
    const chat = () => $.prompt.fill({ text: `Re [goal] ${g.title}: `, mode: 'replace' })
    const clear = () => change($, prev => ({ ...prev, goal: null, previous: [g, ...prev.previous].slice(0, MAX_PREVIOUS) }))
    const toggle = () => update($, expanded, x => !x)

    return (
      <Box flexDirection="column" gap={1}>
        <Box key="head" flexDirection="column">
          <Text bold wrap="wrap">
            {isComplete(g) ? '✓ ' : ''}
            {g.title}
          </Text>
          {g.summary && (
            <Text dimColor wrap={more ? 'wrap' : 'truncate-end'}>
              {more ? g.summary : oneLine(g.summary, width * 2)}
            </Text>
          )}
          {more && g.why && <Text dimColor wrap="wrap">Why: {g.why}</Text>}
        </Box>
        {total > 0 && (
          <Box key="steps" flexDirection="column">
            <Text key="progress">
              {bar(done, total, width - 12)} <Text dimColor>{done}/{total} steps</Text>
            </Text>
            {g.steps.map((step, n) => (
              <Text
                key={`step-${n}`}
                wrap="truncate-end"
                bold={step.status === 'doing'}
                dimColor={step.status === 'done'}
              >
                {mark(step.status)} {n + 1}. {step.title}
              </Text>
            ))}
          </Box>
        )}
        <Box key="actions" flexDirection="row" gap={1}>
          <Button key="chat" label="Chat" onPress={chat} />
          <Button key="clear" dimColor label="Clear" onPress={clear} />
          {(g.why || s.previous.length > 0 || (g.summary ?? '').length > width * 2) && (
            <Button key="more" dimColor plain label={more ? 'less' : 'more'} onPress={toggle} />
          )}
        </Box>
        {s.previous.length > 0 && more && (
          <Box key="previous" flexDirection="column">
            <Text dimColor>Earlier goals</Text>
            {s.previous.map((p, n) => (
              <Text key={`prev-${n}`} dimColor wrap="truncate-end">
                {isComplete(p) ? '✓' : '·'} {p.title}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
