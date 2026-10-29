export type Tally = { input: number; output: number }

declare module 'claude-code' {
  interface PluginState {
    tokenomat: { last: Tally | null; session: Tally }
  }
}
