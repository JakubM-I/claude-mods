export type Commit = {
  hash: string
  subject: string
  author: string
  // Committer date, seconds since the epoch.
  date: number
}

export type Branch = {
  name: string
  isCurrent: boolean
  commit: Commit
  // Commits on the branch that main lacks, and the other way round.
  ahead: number
  behind: number
  // 'merged': every commit reachable from main; 'squashed': its changes are
  // in main under other commits (squash or rebase merge); 'open': neither.
  status: 'merged' | 'squashed' | 'open'
}

export type Snapshot =
  | { kind: 'idle' }
  | { kind: 'error'; message: string; takenAt: number }
  | {
      kind: 'repo'
      main: Branch
      branches: Branch[]
      takenAt: number
    }

declare module 'claude-code' {
  interface PluginState {
    'git-branches': { snapshot: Shaped<Snapshot>; expanded: string[] }
  }
}
