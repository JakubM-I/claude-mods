import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { ago, commits } from './hooks/register'

const PANE = {
  plugin: 'git-branches',
  component: 'Pane',
  requestId: 'git-branches',
  props: {
    title: 'Gałęzie',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// What the person typing /git-branches at the prompt raises.
const RUN = {
  command: 'git-branches',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const NOW = 1_800_000_000
const ref = (head: string, name: string, hash: string, ageSec: number, subject: string) =>
  [head, name, hash, String(NOW - ageSec), 'Jakub', subject].join('\x1f')

const ok = (stdout: string) => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})
const fail = (stderr: string) => ({
  value: { exitCode: 128, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

// A repo: main; mod/done merged; mod/wip two commits ahead, one behind;
// mod/picked one commit ahead whose patch main already has.
const fakeGit = (argv: readonly string[]) => {
  const args = argv.slice(1).join(' ')
  if (args.startsWith('for-each-ref')) {
    return ok(
      [
        ref(' ', 'mod/wip', 'aaa1111', 120, 'wip: half done'),
        ref('*', 'main', 'bbb2222', 3600, 'Merge pull request #1'),
        ref(' ', 'mod/picked', 'ccc3333', 2 * 86_400, 'picked: tweak'),
        ref(' ', 'mod/done', 'ddd4444', 86_400, 'done: finish'),
      ].join('\n') + '\n',
    )
  }
  if (args.startsWith('symbolic-ref')) return ok('origin/main\n')
  if (args === 'rev-list --left-right --count main...mod/wip') return ok('1\t2\n')
  if (args === 'rev-list --left-right --count main...mod/picked') return ok('0\t1\n')
  if (args === 'rev-list --left-right --count main...mod/done') return ok('3\t0\n')
  if (args === 'cherry main mod/wip') return ok('+ aaa0000\n+ aaa1111\n')
  if (args === 'cherry main mod/picked') return ok('- ccc3333\n')

  return fail(`unexpected: git ${args}`)
}

// Nothing sits beneath the plugin: each hook here stands for the engine.
const start = (on: On) => {
  on('command.register', () => ({ value: { command: 'git-branches' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: NOW * 1000 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))
}

test('main on top, then each branch with its last commit and merge state', async ($, on) => {
  start(on)
  on('process.run', (_, e) => fakeGit(e.argv))

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const at = (re: RegExp) => texts.findIndex(t => re.test(t))

    expect(texts[0]).toBe('◆')
    expect(texts[1]).toBe('main ● bieżąca')
    expect(at(/^mod\/wip$/)).toBeLessThan(at(/^mod\/picked$/))
    expect(texts).toContain('aaa1111 · wip: half done')
    expect(texts).toContain('Jakub, 2 min temu')
    expect(texts.some(t => /✗ niewciągnięta · 2 commity ponad main/.test(t))).toBe(true)
    expect(texts.some(t => /main ma 1 commit więcej/.test(t))).toBe(true)
    expect(texts).toContain('✓ wciągnięta do main')
    expect(texts.some(t => /✓ zmiany są w main/.test(t))).toBe(true)
    await ui.unmount()
  }
})

test('outside a repo the pane says why and offers a refresh', async ($, on) => {
  start(on)
  on('process.run', () => fail('fatal: not a git repository (or any of the parent directories): .git'))

  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /Nie mogę odczytać/ }))?.text).toBe(
    'Nie mogę odczytać repozytorium: fatal: not a git repository (or any of the parent directories): .git',
  )
  expect(await ui.find({ type: 'Button', key: 'refresh' })).toBeDefined()
  await ui.unmount()
})

test('refresh picks up a new branch', async ($, on) => {
  start(on)
  let extra = ''
  on('process.run', (_, e) => {
    const args = e.argv.slice(1).join(' ')
    if (args.startsWith('for-each-ref')) return ok(ref('*', 'main', 'bbb2222', 60, 'init') + '\n' + extra)
    if (args.startsWith('symbolic-ref')) return fail('')
    if (args.startsWith('rev-list')) return ok('0\t0\n')

    return fail(args)
  })

  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /nie ma innych gałęzi/ }))?.text).toBe(
    'Poza main nie ma innych gałęzi.',
  )

  extra = ref(' ', 'mod/new', 'eee5555', 5, 'start') + '\n'
  await ui.press({ key: 'refresh' })
  expect((await ui.find({ type: 'Text', text: /^mod\/new$/ }))?.text).toBe('mod/new')
  await ui.unmount()
})

test('a subject is one line until its arrow is pressed', async ($, on) => {
  start(on)
  on('process.run', (_, e) => fakeGit(e.argv))

  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const subject = () => ui.find({ type: 'Text', text: 'aaa1111 · wip: half done' })

  expect((await subject())?.props.wrap).toBe('truncate-end')
  await ui.press({ key: 'subject:mod/wip' })
  expect((await subject())?.props.wrap).toBe('wrap')
  expect((await ui.find({ type: 'Button', key: 'subject:mod/wip' }))?.text).toBe('▾')
  await ui.press({ key: 'subject:mod/wip' })
  expect((await subject())?.props.wrap).toBe('truncate-end')
  await ui.unmount()
})

test('Polish plurals and relative times', async () => {
  expect([1, 2, 4, 5, 12, 22, 25].map(commits)).toEqual([
    '1 commit',
    '2 commity',
    '4 commity',
    '5 commitów',
    '12 commitów',
    '22 commity',
    '25 commitów',
  ])
  expect(ago(NOW - 10, NOW)).toBe('przed chwilą')
  expect(ago(NOW - 7200, NOW)).toBe('2 godz. temu')
  expect(ago(NOW - 86_400, NOW)).toBe('wczoraj')
  expect(ago(NOW - 5 * 86_400, NOW)).toBe('5 dni temu')
})
