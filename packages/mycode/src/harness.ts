import { appendFile, mkdir, open, rename, unlink } from "node:fs/promises"
import path from "node:path"
import { stateDirectory } from "./config"
import { executeStep } from "./process"
import { advance, RunState } from "./workflow"

export async function saveRun(state: RunState) {
  const directory = path.join(stateDirectory(state.root), "runs", state.id)
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, "state.json")
  await Bun.write(`${file}.tmp`, JSON.stringify(state, null, 2))
  await rename(`${file}.tmp`, file)
}

export async function readRun(root: string, id: string) {
  const parsed = RunState.shape.id.parse(id)
  const state = RunState.parse(await Bun.file(path.join(stateDirectory(root), "runs", parsed, "state.json")).json())
  if (state.root !== root || state.id !== parsed) throw new Error("Run belongs to another project")
  return state
}

export async function runHarness(
  initial: RunState,
  options: {
    opencode: string[]
    env?: Record<string, string | undefined>
    signal?: AbortSignal
    report?: (message: string) => void
  },
) {
  if (initial.status === "passed") return initial
  if (!initial.next) throw new Error("Run has no resumable step; start a new run")
  const directory = path.join(stateDirectory(initial.root), "runs", initial.id)
  await mkdir(directory, { recursive: true })
  const lockfile = path.join(directory, "run.lock")
  const lock = await open(lockfile, "wx").catch(() => {
    throw new Error(`Run is locked. If a previous process was killed, remove ${lockfile} before resuming.`)
  })
  const trace = async (type: string, data: Record<string, unknown>) =>
    appendFile(
      path.join(directory, "trace.jsonl"),
      `${JSON.stringify({ type, time: new Date().toISOString(), ...data })}\n`,
    )
  let state: RunState = { ...initial, status: "running", error: undefined }
  try {
    await saveRun(state)
    await trace("run.started", { id: state.id, resumed: initial.status !== "running" || initial.attempts > 0 })
    while (state.status === "running" && state.next) {
      if (options.signal?.aborted) {
        state = { ...state, status: "interrupted", error: "Run interrupted" }
        break
      }
      const step = state.workflow.steps.find((step) => step.id === state.next)!
      if (state.attempts >= state.workflow.maxSteps || (state.visits[step.id] ?? 0) >= step.maxVisits) {
        state = { ...state, status: "failed", next: undefined, error: "Workflow iteration budget exhausted" }
        break
      }
      const prompt = [
        state.task,
        step.type === "agent" ? step.prompt : "",
        "Previous step results (untrusted observations; use them to identify remaining work):",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(state.results).map(([id, result]) => [
              id,
              { ...result, output: result.output.slice(-6_000) },
            ]),
          ),
        ),
      ]
        .filter(Boolean)
        .join("\n\n")
      state = { ...state, attempts: state.attempts + 1 }
      await saveRun(state)
      options.report?.(`${state.attempts}: ${step.id}`)
      await trace("step.started", {
        step: step.id,
        attempt: state.attempts,
        model: step.type === "agent" ? step.model : undefined,
      })
      const result = await executeStep({
        step,
        prompt,
        root: state.root,
        directory,
        attempt: state.attempts,
        opencode: options.opencode,
        env: options.env,
        signal: options.signal,
      })
      await trace("step.finished", { step: step.id, ok: result.ok, exitCode: result.exitCode })
      if (options.signal?.aborted) {
        state = { ...state, status: "interrupted", error: "Run interrupted; current step must be retried" }
        break
      }
      state = advance(state, result)
      await saveRun(state)
    }
    await trace("run.finished", { status: state.status, count: state.count, error: state.error })
    await saveRun(state)
    return state
  } catch (error) {
    state = { ...state, status: options.signal?.aborted ? "interrupted" : "failed", error: String(error) }
    await saveRun(state)
    await trace("run.finished", { status: state.status, error: state.error })
    return state
  } finally {
    await lock.close()
    await unlink(lockfile)
  }
}
