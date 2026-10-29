import type { PromptEditInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'tokenomat',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const usage = (input: number, output: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  model: 'claude-opus-5-5',
})

const turn = (id: string, input: number, output: number, agentId?: string) => ({
  answer: '',
  durationMs: 1,
  isAborted: false,
  reason: 'answer' as const,
  turnId: id,
  usage: usage(input, output),
  ...(agentId === undefined ? {} : { agentId }),
})

const usageNow = (tokens?: number) => ({
  value: {
    startedAt: 0,
    context: { window: 200_000, ...(tokens === undefined ? {} : { tokens }) },
    rateLimits: [],
  },
})

test('the band shows every counter at zero before anything happens', async ($, on) => {
  on('session.usage', () => usageNow())

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /^🪙/ }))?.text).toBe(
    '🪙\u00a0\u00a0 ✎ szkic ≈0 (z kontekstem ≈0) · wiadomość 0 (↑0 ↓0) · sesja 0 (↑0 ↓0)',
  )
  await ui.unmount()
})

test('the band yields to a survey', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
    surface: 'desktop',
  })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the band counts the last message and the session, on every surface', async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.usage', () => usageNow())

  await $.turn.complete(turn('t1', 1200, 300))
  await $.turn.complete(turn('t2', 5000, 500))
  await $.turn.complete(turn('a1', 100_000, 0, 'agent-1'))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    // last: 5000 + 500, the subagent turn left out; session: 1500 + 5500 + 100000
    expect((await ui.find({ type: 'Text', text: /^5\.5k$/ }))?.text).toBe('5.5k')
    expect((await ui.find({ type: 'Text', text: /^107k$/ }))?.text).toBe('107k')
    await ui.unmount()
  }
})

test('the band estimates the draft live and clears it on submit', async ($, on) => {
  on('session.usage', () => usageNow(30_000))
  on('prompt.edit', (_, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)

    return { text, cursor: e.start + e.inputText.length }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))

  // The kit raises prompt.edit as a session does, though its typings leave it off `$.prompt`.
  const prompt = $.prompt as unknown as { edit: (e: PromptEditInput) => Promise<unknown> }
  const typing = 'x'.repeat(400)
  await prompt.edit({
    origin: { kind: 'composer' },
    text: '',
    cursor: 0,
    start: 0,
    end: 0,
    inputText: typing,
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  // 400 ASCII chars ≈ 100 tokens; with the 30k context ≈ 30.1k
  expect((await ui.find({ type: 'Text', text: /^≈100$/ }))?.text).toBe('≈100')
  // The band is one line: the outer Text holds every run.
  expect((await ui.find({ type: 'Text', text: /^🪙/ }))?.text).toBe(
    '🪙\u00a0\u00a0 ✎ szkic ≈100 (z kontekstem ≈30k) · wiadomość 0 (↑0 ↓0) · sesja 0 (↑0 ↓0)',
  )

  await $.prompt.submit({ text: typing, wait: false, origin: { kind: 'composer' } })
  expect((await ui.find({ type: 'Text', text: /^≈\d/ }))?.text).toBe('≈0')
  await ui.unmount()
})
