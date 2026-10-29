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

test('the band shows nothing before the first turn', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the band counts the last message and the session, on every surface', async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer }))

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
