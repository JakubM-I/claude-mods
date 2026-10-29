import { atom, read, update } from 'claude-code'
import type { ModelUsage, Register } from 'claude-code'

import type { Tally } from '../types'

const last = atom({ plugin: 'tokenomat', key: 'last' } as const, null)
const session = atom({ plugin: 'tokenomat', key: 'session' } as const, {
  input: 0,
  output: 0,
})

// Everything the API read as input counts as sent: uncached, cache-written and cache-read.
const toTally = (u: ModelUsage): Tally => ({
  input: u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens,
  output: u.output_tokens,
})

const total = (t: Tally) => t.input + t.output

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 10_000
      ? `${Math.round(n / 1000)}k`
      : n >= 1000
        ? `${(n / 1000).toFixed(1)}k`
        : String(n)

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      const turn = toTally(e.usage)

      // Subagent turns add to the session total; the "last message" is the main loop's.
      if (e.agentId === undefined) {
        await update($, last, () => turn)
      }
      await update($, session, s => ({
        input: s.input + turn.input,
        output: s.output + turn.output,
      }))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const turn = await read($, last)

    if (e.props.hasSurvey || turn === null) {
      return next(e)
    }

    const sum = await read($, session)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text bold>🪙 Tokenomat</Text>
        <Text dimColor> · wiadomość </Text>
        <Text>{fmt(total(turn))}</Text>
        <Text dimColor>
          {' '}(↑{fmt(turn.input)} ↓{fmt(turn.output)})
        </Text>
        <Text dimColor> · sesja </Text>
        <Text bold>{fmt(total(sum))}</Text>
        <Text dimColor>
          {' '}(↑{fmt(sum.input)} ↓{fmt(sum.output)})
        </Text>
      </Box>
    )
  })
}
