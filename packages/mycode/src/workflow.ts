import { z } from "zod"
import { Workflow } from "./config"

export const StepResult = z.object({
  ok: z.boolean(),
  output: z.string(),
  exitCode: z.number().int(),
})
export type StepResult = z.infer<typeof StepResult>

export const RunState = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  root: z.string(),
  task: z.string().min(1),
  workflow: Workflow,
  status: z.enum(["running", "passed", "failed", "interrupted"]),
  next: z.string().optional(),
  visits: z.record(z.string(), z.number().int().nonnegative()),
  count: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative().default(0),
  results: z.record(z.string(), StepResult),
  error: z.string().optional(),
})
export type RunState = z.infer<typeof RunState>

export function createRun(workflow: Workflow, task: string, root: string): RunState {
  return RunState.parse({
    version: 1,
    id: crypto.randomUUID(),
    root,
    task,
    workflow,
    status: "running",
    next: workflow.start,
    visits: {},
    count: 0,
    results: {},
  })
}

export function advance(state: RunState, result: StepResult): RunState {
  if (state.status !== "running" || !state.next) return state
  const step = state.workflow.steps.find((step) => step.id === state.next)!
  const next = result.ok ? step.onSuccess : step.onFailure
  const count = state.count + 1
  const visits = { ...state.visits, [step.id]: (state.visits[step.id] ?? 0) + 1 }
  const results = { ...state.results, [step.id]: result }
  if (!next) return { ...state, visits, results, count, next: undefined, status: result.ok ? "passed" : "failed" }
  const target = state.workflow.steps.find((step) => step.id === next)!
  if (count >= state.workflow.maxSteps || (visits[next] ?? 0) >= target.maxVisits)
    return {
      ...state,
      visits,
      results,
      count,
      next: undefined,
      status: "failed",
      error: "Workflow iteration budget exhausted",
    }
  return { ...state, visits, results, count, next }
}
