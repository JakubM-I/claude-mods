import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Branch, Commit, Snapshot } from '../types'

const PANE = 'git-branches'
const TITLE = 'Gałęzie'
// Change the tag when Snapshot's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snapshot = atom({ plugin: 'git-branches', key: 'snapshot' } as const, { kind: 'idle' }, {
  shape: 'snapshot-1',
})

type Run = (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>

const SEP = '\x1f'
// %1f is for-each-ref's hex escape: a separator no branch name or subject holds.
const FORMAT = ['%(HEAD)', '%(refname:short)', '%(objectname:short)', '%(committerdate:unix)', '%(authorname)', '%(subject)']
  .join('%1f')

const git = async (run: Run, args: string[]) => {
  const out = await run(['git', ...args])
  if (out.exitCode !== 0) {
    throw new Error(out.stderr.trim() || `git ${args[0]} zakończył się kodem ${out.exitCode}`)
  }

  return out.stdout
}

type Ref = { name: string; isCurrent: boolean; commit: Commit }

export const parseRefs = (stdout: string): Ref[] =>
  stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const [head = '', name = '', hash = '', date = '0', author = '', ...subject] = line.split(SEP)

      return {
        name,
        isCurrent: head === '*',
        commit: { hash, date: Number(date), author, subject: subject.join(SEP) },
      }
    })

// origin/HEAD names the remote's default branch; without a remote, main, then master.
const findMain = async (run: Run, refs: Ref[]) => {
  const names = new Set(refs.map(r => r.name))
  const origin = await run(['git', 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  const fromOrigin = origin.stdout.trim().replace(/^origin\//, '')

  if (origin.exitCode === 0 && names.has(fromOrigin)) return fromOrigin
  if (names.has('main')) return 'main'
  if (names.has('master')) return 'master'

  return refs.find(r => r.isCurrent)?.name ?? refs[0]?.name
}

const toBranch = async (run: Run, ref: Ref, main: string): Promise<Branch> => {
  if (ref.name === main) return { ...ref, ahead: 0, behind: 0, status: 'merged' }

  const counts = await git(run, ['rev-list', '--left-right', '--count', `${main}...${ref.name}`])
  const [behind = 0, ahead = 0] = counts.trim().split(/\s+/).map(Number)
  if (ahead === 0) return { ...ref, ahead, behind, status: 'merged' }

  // `-` marks a commit whose patch main already has: a rebase or cherry-pick merge.
  const cherry = await git(run, ['cherry', main, ref.name])
  const isSquashed = !cherry.split('\n').some(line => line.startsWith('+'))

  return { ...ref, ahead, behind, status: isSquashed ? 'squashed' : 'open' }
}

export const takeSnapshot = async (run: Run, now: number): Promise<Snapshot> => {
  const takenAt = Math.floor(now / 1000)
  try {
    const refs = parseRefs(
      await git(run, ['for-each-ref', '--sort=-committerdate', `--format=${FORMAT}`, 'refs/heads']),
    )
    const main = await findMain(run, refs)
    const mainRef = refs.find(r => r.name === main)
    if (mainRef === undefined || main === undefined) {
      return { kind: 'error', message: 'Repozytorium nie ma jeszcze żadnej gałęzi.', takenAt }
    }

    const branches = await Promise.all(refs.filter(r => r.name !== main).map(r => toBranch(run, r, main)))

    return { kind: 'repo', main: await toBranch(run, mainRef, main), branches, takenAt }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    return { kind: 'error', message: message.split('\n')[0] ?? message, takenAt }
  }
}

export const ago = (seconds: number, now: number) => {
  const s = Math.max(0, now - seconds)
  if (s < 60) return 'przed chwilą'
  if (s < 3600) return `${Math.floor(s / 60)} min temu`
  if (s < 86_400) return `${Math.floor(s / 3600)} godz. temu`
  if (s < 30 * 86_400) {
    const days = Math.floor(s / 86_400)
    return days === 1 ? 'wczoraj' : `${days} dni temu`
  }

  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

// 1 commit, 2–4 commity, 5+ commitów (but 12–14 commitów, 22 commity).
export const commits = (n: number) => {
  const tens = n % 100
  const ones = n % 10
  const word = n === 1 ? 'commit' : ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? 'commity' : 'commitów'

  return `${n} ${word}`
}

// A module variable is fine here: a reload loses it only while no refresh runs.
let isRefreshing = false

async function refresh($: EngineInterface) {
  if (isRefreshing) return
  isRefreshing = true
  try {
    const next = await takeSnapshot(argv => $.process.run(argv), await $.clock.now())
    await update($, snapshot, () => next)
  } finally {
    isRefreshing = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'git-branches',
      description: 'Pokaż gałęzie repozytorium w panelu bocznym',
    })
    void refresh($)

    return next(e)
  })

  on('command.run', { command: 'git-branches' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Otwarto panel gałęzi.' }
  })

  // A turn may have committed, merged or switched branches.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const reload = (
      <Button key="refresh" plain onPress={() => refresh($)}>
        ↻ odśwież
      </Button>
    )

    if (snap.kind === 'idle') return <Text dimColor>Wczytuję gałęzie…</Text>
    if (snap.kind === 'error') {
      return (
        <Box flexDirection="column">
          <Text color="error">Nie mogę odczytać repozytorium: {snap.message}</Text>
          {reload}
        </Box>
      )
    }

    const now = snap.takenAt
    const lastCommit = (b: Branch) => (
      <Text dimColor wrap="wrap">
        {b.commit.hash} · {b.commit.subject} · {b.commit.author}, {ago(b.commit.date, now)}
      </Text>
    )
    // A branch just cut from main is reachable from it too, but nothing was merged.
    const mergeLine = (b: Branch) =>
      b.commit.hash === snap.main.commit.hash ? (
        <Text dimColor>= na tym samym commicie co {snap.main.name}, bez własnych zmian</Text>
      ) : b.status === 'merged' ? (
        <Text color="success">✓ wciągnięta do {snap.main.name}</Text>
      ) : b.status === 'squashed' ? (
        <Text color="success">✓ zmiany są w {snap.main.name} (rebase / cherry-pick)</Text>
      ) : (
        <Text color="warning">
          ✗ niewciągnięta · {commits(b.ahead)} ponad {snap.main.name}
          {b.behind > 0 && <Text dimColor> · {snap.main.name} ma {commits(b.behind)} więcej</Text>}
        </Text>
      )
    const current = (b: Branch) => (b.isCurrent ? <Text color="suggestion"> ● bieżąca</Text> : null)

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="suggestion">
            ◆ {snap.main.name}
            {current(snap.main)}
          </Text>
          {lastCommit(snap.main)}
        </Box>
        {snap.branches.length === 0 && <Text dimColor>Poza {snap.main.name} nie ma innych gałęzi.</Text>}
        {snap.branches.map(b => (
          <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
            <Text bold>
              ├ {b.name}
              {current(b)}
            </Text>
            {lastCommit(b)}
            {mergeLine(b)}
          </Box>
        ))}
        <Text dimColor>
          {snap.branches.length + 1} gałęzi · stan z {new Date(now * 1000).toLocaleTimeString('pl-PL')}
        </Text>
        {reload}
      </Box>
    )
  })
}
