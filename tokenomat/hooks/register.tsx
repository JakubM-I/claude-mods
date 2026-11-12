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

// The session total outlives the process in $.store, so a resumed conversation
// picks up where it left off instead of starting from zero.
const storeKey = (sessionId: string) => `session:${sessionId}`

const isTally = (v: unknown): v is Tally =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Tally).input === 'number' &&
  typeof (v as Tally).output === 'number'

// Sums the assistant usage in a transcript (JSONL). One API response may be
// written as several rows sharing its message id, so each id counts once.
export const tallyTranscript = (jsonl: string): Tally => {
  const byId = new Map<string, Tally>()
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"usage"')) continue
    try {
      const row = JSON.parse(line)
      const msg = row?.message
      if (row?.type !== 'assistant' || !msg?.usage || typeof msg.id !== 'string') continue
      const u = msg.usage
      byId.set(msg.id, {
        input:
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0),
        output: u.output_tokens ?? 0,
      })
    } catch {
      // A torn last line while the session writes: skip it.
    }
  }

  let input = 0
  let output = 0
  for (const t of byId.values()) {
    input += t.input
    output += t.output
  }

  return { input, output }
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

  // After a reload or a restart: take the total this session already stored.
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get(storeKey(await $.session.id()))

    if (isTally(stored)) {
      await update($, session, s => (total(s) === 0 ? stored : s))
    }

    return next(e)
  })

  // A resumed conversation the mod never counted (or counted before it stored
  // anything): rebuild the total from the transcript once. A transcript over
  // 4 MiB cannot be read; the total then starts from zero as before.
  on('classic.SessionStart', async ($, e, next) => {
    const key = storeKey(e.session_id)

    if (e.source !== 'startup' && e.source !== 'clear' && !isTally(await $.store.get(key))) {
      const counted = await $.fs.read(e.transcript_path).then(tallyTranscript, () => null)

      if (counted !== null && total(counted) > 0) {
        await update($, session, s => (total(s) === 0 ? counted : s))
        await $.store.set(key, await read($, session))
      }
    }

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
      await $.store.set(storeKey(await $.session.id()), await read($, session))
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
    // A failed read must not cost the whole band (a throw while drawing hides it).
    const contextTokens = await $.session.usage().then(
      u => u.context.tokens ?? 0,
      () => 0,
    )
    const { Box, Text } = $.ui.resolve(e)

    // The logo stays at the left edge; the three groups share the rest with
    // equal space around each (space-evenly), wrapping to a second row when
    // narrow. Each group is one Text with nested runs, so it never splits apart.
    return (
      <Box flexDirection="row" width="100%">
        {/* Non-breaking: the desktop collapses a run of plain spaces into one. */}
        <Text>🪙{'\u00a0\u00a0'}</Text>
        <Box
          flexDirection="row"
          flexWrap="wrap"
          flexGrow={1}
          justifyContent="space-evenly"
          columnGap={3}
        >
          <Text wrap="wrap">
            <Text dimColor>✎ szkic </Text>
            <Text bold color="warning">
              ≈{fmt(typed)}
            </Text>
            <Text dimColor> (z kontekstem ≈{fmt(contextTokens + typed)})</Text>
          </Text>
          <Text wrap="wrap">
            <Text dimColor>wiadomość </Text>
            <Text bold color="suggestion">
              {fmt(total(turn))}
            </Text>
            <Text dimColor>
              {' '}
              (↑{fmt(turn.input)} ↓{fmt(turn.output)})
            </Text>
          </Text>
          <Text wrap="wrap">
            <Text dimColor>sesja </Text>
            <Text bold color="success">
              {fmt(total(sum))}
            </Text>
            <Text dimColor>
              {' '}
              (↑{fmt(sum.input)} ↓{fmt(sum.output)})
            </Text>
          </Text>
        </Box>
      </Box>
    )
  })
}
