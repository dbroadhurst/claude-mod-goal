import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'goal',
  props: { title: 'Goal', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { top: 0, bodyRows: 30, treeRows: 0 }, view: {} },
} as const

const text = (r: unknown) => String((r as { result?: unknown }).result)

test('the goal shows with its steps and progress', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)

  await $.tool.call({
    tool: 'mcp__goal__set',
    title: 'Windowshade',
    summary: 'Main, EQ and playlist fold to their title bars',
    why: 'Winamp parity on the Mac',
    steps: ['Geometry', 'State', 'Painters', 'Wiring', 'Tests'],
    done: 2,
  } as never)
  await $.tool.call({ tool: 'mcp__goal__step', step: 3, status: 'doing' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'goal', surface, ...PANE } as never)
    expect(await ui.find({ type: 'Text', text: /Windowshade/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2\/5 steps/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▶ 3\. Painters/ })).toBeDefined()
    await ui.unmount()
  }

  expect(text(await $.tool.call({ tool: 'mcp__goal__get' } as never))).toBe(
    [
      'Goal: Windowshade',
      'Summary: Main, EQ and playlist fold to their title bars',
      'Why: Winamp parity on the Mac',
      'Steps (2/5 done):',
      '1. ✓ Geometry',
      '2. ✓ State',
      '3. ▶ Painters',
      '4. ○ Wiring',
      '5. ○ Tests',
    ].join('\n'),
  )
})

test('one step is in progress at a time, and the last done completes the goal', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)

  await $.tool.call({ tool: 'mcp__goal__set', title: 'Ship', steps: ['Build', 'Upload'] } as never)
  await $.tool.call({ tool: 'mcp__goal__step', step: 1, status: 'doing' } as never)
  await $.tool.call({ tool: 'mcp__goal__step', step: 2, status: 'doing' } as never)
  expect(text(await $.tool.call({ tool: 'mcp__goal__get' } as never))).toMatch(/1\. ○ Build\n2\. ▶ Upload/)

  await $.tool.call({ tool: 'mcp__goal__step', step: 1, status: 'done' } as never)
  const last = await $.tool.call({ tool: 'mcp__goal__step', step: 2, status: 'done' } as never)
  expect(text(last)).toBe('Step 2 done. Goal complete.')
  expect(text(await $.tool.call({ tool: 'mcp__goal__step', step: 9, status: 'done' } as never))).toBe('No step 9; the goal has 2.')
})

test('a new goal moves the old one to history; Clear empties the pane', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('prompt.fill', async () => ({ value: { isFilled: true } }) as never)

  await $.tool.call({ tool: 'mcp__goal__set', title: 'First' } as never)
  await $.tool.call({ tool: 'mcp__goal__set', title: 'Second', why: 'because' } as never)

  const ui = await $.ui.mount({ plugin: 'goal', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'more' })
  expect(await ui.find({ type: 'Text', text: /· First/ })).toBeDefined()
  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Text', text: /No goal set/ })).toBeDefined()
  expect(text(await $.tool.call({ tool: 'mcp__goal__get' } as never))).toBe('No goal is set.')
})
