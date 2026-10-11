export type StepStatus = 'todo' | 'doing' | 'done'

export type Step = { title: string; status: StepStatus }

export type Goal = {
  title: string
  summary?: string
  why?: string
  steps: Step[]
  setAt: number
  changedAt: number
}

export type GoalState = { root: string; goal: Goal | null; previous: Goal[] }

declare module 'claude-code' {
  interface PluginState {
    goal: { state: GoalState; expanded: boolean }
  }
}
