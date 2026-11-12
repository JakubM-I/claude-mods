import type { PromptEditInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { tallyTranscript } from './hooks/register'

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

  expect((await ui.find({ type: 'Text', text: /^✎/ }))?.text).toBe(
    '✎ szkic ≈0 (z kontekstem ≈0)',
  )
  // Each group is its own Text, spread apart by the Box.
  expect((await ui.find({ type: 'Text', text: /^wiadomość/ }))?.text).toBe('wiadomość 0 (↑0 ↓0)')
  expect((await ui.find({ type: 'Text', text: /^sesja/ }))?.text).toBe('sesja 0 (↑0 ↓0)')
  await ui.unmount()
})

test('the band stays when the context read fails mid-turn', async ($, on) => {
  on('session.usage', () => {
    throw new Error('busy')
  })

  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, isWorking: true },
    surface: 'desktop',
  })

  expect((await ui.find({ type: 'Text', text: /^✎/ }))?.text).toBe(
    '✎ szkic ≈0 (z kontekstem ≈0)',
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
  expect((await ui.find({ type: 'Text', text: /^✎/ }))?.text).toBe(
    '✎ szkic ≈100 (z kontekstem ≈30k)',
  )

  await $.prompt.submit({ text: typing, wait: false, origin: { kind: 'composer' } })
  expect((await ui.find({ type: 'Text', text: /^≈\d/ }))?.text).toBe('≈0')
  await ui.unmount()
})

test('a transcript counts each response once', () => {
  const row = (id: string, input: number, cached: number, output: number) =>
    JSON.stringify({
      type: 'assistant',
      message: {
        id,
        usage: {
          input_tokens: input,
          cache_read_input_tokens: cached,
          cache_creation_input_tokens: 0,
          output_tokens: output,
        },
      },
    })
  const jsonl = [
    JSON.stringify({ type: 'user', message: { content: 'hi' } }),
    row('m1', 100, 900, 50),
    row('m1', 100, 900, 50),
    row('m2', 10, 2000, 5),
    '{"type":"assistant","message":{"id":"m3","usage"',
  ].join('\n')

  expect(tallyTranscript(jsonl)).toEqual({ input: 3010, output: 55 })
})

test('a reload takes the session total this session stored', async ($, on) => {
  const stored = { input: 2_000_000, output: 40_000 }
  on('session.usage', () => usageNow())
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: e.key === 'session:s1' ? stored : undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /^2\.04M$/ }))?.text).toBe('2.04M')
  await ui.unmount()
})

test('a resumed conversation is counted from its transcript once', async ($, on) => {
  const saved: Record<string, unknown> = {}
  on('session.usage', () => usageNow())
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  on('store.set', (_, e) => {
    saved[e.key] = e.value

    return { value: undefined }
  })
  on('fs.read', () => ({
    value: JSON.stringify({
      type: 'assistant',
      message: {
        id: 'm1',
        usage: {
          input_tokens: 5000,
          cache_read_input_tokens: 95_000,
          cache_creation_input_tokens: 0,
          output_tokens: 2000,
        },
      },
    }),
  }))
  on('classic.SessionStart', () => ({}))

  await $.classic.SessionStart({
    source: 'resume',
    session_id: 's2',
    transcript_path: '/t/s2.jsonl',
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /^102k$/ }))?.text).toBe('102k')
  expect(saved['session:s2']).toEqual({ input: 100_000, output: 2000 })
  await ui.unmount()
})
