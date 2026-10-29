import { atom, read, update } from 'claude-code'
import type { ModelUsage, Register } from 'claude-code'

import type { Tally } from '../types'

const last = atom({ plugin: 'tokenomat', key: 'last' } as const, null)
const session = atom({ plugin: 'tokenomat', key: 'session' } as const, {
  input: 0,
  output: 0,
})
const draft = atom({ plugin: 'tokenomat', key: 'draft' } as const, '')

// Everything the API read as input counts as sent: uncached, cache-written and cache-read.
const toTally = (u: ModelUsage): Tally => ({
  input: u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens,
  output: u.output_tokens,
})

const total = (t: Tally) => t.input + t.output

// No tokenizer here: ~4 ASCII chars per token, non-ASCII (Polish diacritics, emoji) much denser.
export const estimate = (text: string) => {
  let ascii = 0
  let other = 0
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii += 1
    else other += 1
  }

  return Math.ceil(ascii / 4 + other / 1.5)
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 10_000
      ? `${Math.round(n / 1000)}k`
      : n >= 1000
        ? `${(n / 1000).toFixed(1)}k`
        : String(n)

export const register: Register = on => {
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)

    if (box.text !== e.text) {
      await update($, draft, () => box.text)
    }

    return box
  })

  // Not prompt.change: the 2.1.294 CLI does not know it yet. A submit empties the box.
  on('prompt.submit', async ($, e, next) => {
    await update($, draft, () => '')

    return next(e)
  })

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
    if (e.props.hasSurvey) {
      return next(e)
    }

    // Always drawn, every counter from zero, so the layout never jumps.
    const turn = (await read($, last)) ?? { input: 0, output: 0 }
    const sum = await read($, session)
    const typed = estimate(await read($, draft))
    const { context } = await $.session.usage()
    const { Text } = $.ui.resolve(e)

    // One Text with nested runs: the line flows and wraps as a whole instead of
    // each run becoming its own block (the desktop stacked them in a column).
    return (
      <Text wrap="wrap">
        {/* Non-breaking: the desktop collapses a run of plain spaces into one. */}
        <Text>🪙{'\u00a0\u00a0'}</Text>
        <Text dimColor> ✎ szkic </Text>
        <Text bold color="warning">
          ≈{fmt(typed)}
        </Text>
        <Text dimColor> (z kontekstem ≈{fmt((context.tokens ?? 0) + typed)})</Text>
        <Text dimColor> · wiadomość </Text>
        <Text bold color="suggestion">
          {fmt(total(turn))}
        </Text>
        <Text dimColor>
          {' '}(↑{fmt(turn.input)} ↓{fmt(turn.output)})
        </Text>
        <Text dimColor> · sesja </Text>
        <Text bold color="success">
          {fmt(total(sum))}
        </Text>
        <Text dimColor>
          {' '}(↑{fmt(sum.input)} ↓{fmt(sum.output)})
        </Text>
      </Text>
    )
  })
}
