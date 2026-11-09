import path from "node:path"
import { z } from "zod"
import { checkTerminalPromise } from "./completion"
import type { Step } from "./config"
import type { StepResult } from "./workflow"

const Event = z.object({
  type: z.string(),
  part: z.object({ text: z.string().optional() }).optional(),
  error: z.unknown().optional(),
})

/** OpenCode can emit an error event with exit code zero; process success alone is insufficient. */
export function decodeAgentOutput(raw: string) {
  const events = raw.split(/\r?\n/).flatMap((line) => {
    if (!line.trim().startsWith("{")) return []
    const json = z
      .string()
      .transform((value, ctx): unknown => {
        try {
          return JSON.parse(value)
        } catch {
          ctx.addIssue({ code: "custom", message: "Malformed event" })
          return z.NEVER
        }
      })
      .pipe(Event)
      .safeParse(line)
    if (!json.success) throw new Error("Malformed OpenCode JSON event")
    return [json.data]
  })
  const errors = events.filter((event) => event.type === "error")
  const output = events
    .filter((event) => event.type === "text")
    .map((event) => event.part?.text ?? "")
    .join("")
  return {
    ok: errors.length === 0 && events.some((event) => event.type === "step_finish") && !!output.trim(),
    output: errors.length ? JSON.stringify(errors) : output,
  }
}

export async function executeStep(input: {
  step: Step
  prompt: string
  root: string
  directory: string
  attempt: number
  opencode: string[]
  env?: Record<string, string | undefined>
  signal?: AbortSignal
}): Promise<StepResult> {
  const step = input.step
  const command =
    step.type === "command"
      ? step.command
      : [
          ...input.opencode,
          "run",
          "--format",
          "json",
          "--agent",
          step.agent,
          ...(step.model ? ["--model", step.model] : []),
          "--",
          input.prompt,
        ]
  const stem = path.join(input.directory, `${input.attempt}-${step.id}`)
  const child = Bun.spawn(command, {
    cwd: input.root,
    env: { ...process.env, ...input.env, PWD: input.root },
    stdin: "ignore",
    stdout: Bun.file(`${stem}.stdout`),
    stderr: Bun.file(`${stem}.stderr`),
    signal: input.signal,
    timeout: step.timeoutMs,
    killSignal: "SIGKILL",
  })
  const exitCode = await child.exited
  const stderr = await Bun.file(`${stem}.stderr`).slice(-8_000).text()
  const file = Bun.file(`${stem}.stdout`)
  if (file.size > 8_000_000) return { ok: false, exitCode, output: `Output exceeded 8 MB; inspect ${stem}.stdout` }
  const stdout = await file.text()
  if (step.type === "command")
    return { ok: exitCode === 0 && !input.signal?.aborted, exitCode, output: `${stdout}\n${stderr}`.slice(-32_000) }
  const decoded = decodeAgentOutput(stdout)
  const ok =
    exitCode === 0 &&
    decoded.ok &&
    !input.signal?.aborted &&
    (!step.promise || checkTerminalPromise(decoded.output, step.promise))
  return { ok, exitCode, output: `${decoded.output}\n${stderr}`.slice(-32_000) }
}
