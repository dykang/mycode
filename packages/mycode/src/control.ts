import type { Plugin } from "@opencode/plugin"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { Control, TraceStep } from "./control-contract"
import { z } from "zod"
import { loadWorkflow, stateDirectory } from "./config"
import { readRun, runHarness, saveRun } from "./harness"
import type { MemoryStore } from "./memory"
import { createRun, type RunState } from "./workflow"

export async function registerControl(
  ctx: Plugin.Context,
  memory: MemoryStore | undefined,
  settings: { get: () => boolean; set: (enabled: boolean) => Promise<void> },
) {
  const root = ctx.location.project.canonical
  const running = new Map<string, { controller: AbortController; promise: Promise<RunState> }>()
  const launch = async (state: RunState) => {
    if (running.size) throw new Error("A workflow is already running in this project")
    await saveRun(state)
    const controller = new AbortController()
    const promise = runHarness(state, { opencode: [process.execPath, "--standalone"], signal: controller.signal })
      .catch(async (error) => {
        const failed = { ...state, status: "failed" as const, error: String(error) }
        await saveRun(failed)
        return failed
      })
      .finally(() => running.delete(state.id))
    running.set(state.id, { controller, promise })
    return state.id
  }
  const registration = await ctx.rpc.register(Control, {
    overview: async (input) => {
      const file = path.join(root, "mycode.yaml")
      const workflow = (await Bun.file(file).exists()) ? await loadWorkflow(file) : null
      const ids = await readdir(path.join(stateDirectory(root), "runs")).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return []
        throw error
      })
      const runs = await Promise.all(ids.slice(-20).map((id) => readRun(root, id)))
      return {
        root,
        memories: memory ? (input.query.trim() ? memory.search(input.query, 20) : memory.list(50)) : [],
        workflow,
        prune: settings.get(),
        skills: (await ctx.skill.list()).data
          .filter((skill) => skill.id.startsWith("mycode-"))
          .map((skill) => skill.id),
        runs: await Promise.all(
          runs.reverse().map(async (run) => ({
            ...run,
            results: Object.entries(run.results).map(([step, result]) => ({ step, ...result })),
            history: await readHistory(root, run.id),
          })),
        ),
      }
    },
    save: async (input) => {
      if (!memory) throw new Error("Project memory is disabled")
      return memory.add({ ...input, source: "desktop:user" })
    },
    forget: async (input) => {
      if (!memory) throw new Error("Project memory is disabled")
      return memory.remove(input.id)
    },
    start: async (input) => launch(createRun(await loadWorkflow(path.join(root, "mycode.yaml")), input.task, root)),
    resume: async (input) => launch(await readRun(root, input.id)),
    cancel: async (input) => {
      const run = running.get(input.id)
      if (!run) return false
      run.controller.abort()
      await run.promise
      return true
    },
    pruning: async (input) => {
      await settings.set(input.enabled)
      return settings.get()
    },
  })
  return {
    dispose: async () => {
      running.forEach((run) => run.controller.abort())
      await Promise.all([...running.values()].map((run) => run.promise))
      await registration.dispose()
    },
  }
}

async function readHistory(root: string, id: string) {
  const file = Bun.file(path.join(stateDirectory(root), "runs", id, "trace.jsonl"))
  if (!(await file.exists())) return []
  const schema = TraceStep.extend({ type: z.literal("step.finished") })
  return (await file.text())
    .split("\n")
    .slice(0, -1)
    .flatMap((line) => {
      const parsed = schema.safeParse(JSON.parse(line))
      return parsed.success ? [parsed.data] : []
    })
}
