import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Workflow } from "../src/config"
import { readRun, runHarness, saveRun } from "../src/harness"
import { createRun } from "../src/workflow"
import { isolatedEnv } from "../../cli/test/fixture/environment"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
async function directory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mycode-harness-"))
  directories.push(root)
  return root
}
const opencode = [process.execPath, path.join(import.meta.dir, "fixtures/agent.ts")]

test("real subprocesses branch on verifier exit code, checkpoint and keep trace/output evidence", async () => {
  const root = await directory()
  const workflow = Workflow.parse({
    version: 1,
    name: "repair-loop",
    start: "implement",
    steps: [
      { id: "implement", type: "agent", model: "fixture/build", prompt: "fix parser", onSuccess: "verify" },
      {
        id: "verify",
        type: "command",
        command: [
          process.execPath,
          "-e",
          'const f = Bun.file("attempt"); if (!(await f.exists())) { await Bun.write(f,"failed once"); process.exit(1) }',
        ],
        onFailure: "implement",
        onSuccess: "review",
      },
      {
        id: "review",
        type: "agent",
        agent: "plan",
        model: "fixture/review",
        prompt: "review-marker",
        promise: "APPROVED",
        onSuccess: "final",
      },
      {
        id: "final",
        type: "command",
        command: [process.execPath, "-e", 'if (!(await Bun.file("attempt").exists())) process.exit(1)'],
      },
    ],
  })
  const run = await runHarness(createRun(workflow, "Fix parser", root), { opencode, env: isolatedEnv(root) })
  expect(run.status).toBe("passed")
  expect(run.visits).toEqual({ implement: 2, verify: 2, review: 1, final: 1 })
  const argumentsByStep = (await Bun.file(path.join(root, "fixture-argv.jsonl")).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string[])
  expect(argumentsByStep[0]).toContain("fixture/build")
  expect(argumentsByStep.at(-1)).toContain("fixture/review")
  expect(argumentsByStep.flat()).not.toContain("--auto")
  expect((await readRun(root, run.id)).status).toBe("passed")
  const trace = await Bun.file(path.join(root, ".mycode/runs", run.id, "trace.jsonl")).text()
  expect(trace).toContain('"ok":false')
  expect(trace).toContain('"status":"passed"')
  expect(await Bun.file(path.join(root, ".mycode/runs", run.id, "1-implement.stdout")).exists()).toBe(true)
  await expect(readRun(root, "../../secret")).rejects.toThrow()
})

test("an interrupted run resumes at its saved next step; a finished run is idempotent", async () => {
  const root = await directory()
  const workflow = Workflow.parse({
    version: 1,
    name: "resume",
    start: "verify",
    steps: [
      { id: "verify", type: "command", command: [process.execPath, "-e", 'await Bun.write("completed", "yes")'] },
    ],
  })
  const initial = { ...createRun(workflow, "Verify change", root), status: "interrupted" as const }
  await saveRun(initial)
  const run = await runHarness(await readRun(root, initial.id), { opencode, env: isolatedEnv(root) })
  expect(run.status).toBe("passed")
  expect(await Bun.file(path.join(root, "completed")).text()).toBe("yes")
  expect(await runHarness(run, { opencode })).toBe(run)
})

test("missing commands are recorded as execution failures and leave a resumable checkpoint", async () => {
  const root = await directory()
  const workflow = Workflow.parse({
    version: 1,
    name: "missing",
    start: "verify",
    steps: [{ id: "verify", type: "command", command: [path.join(root, "nonexistent-program")] }],
  })
  const run = await runHarness(createRun(workflow, "Check", root), { opencode, env: isolatedEnv(root) })
  expect(run.status).toBe("failed")
  expect(run.next).toBe("verify")
  expect(run.error).toBeDefined()
})

test("timeout and cancellation never produce a passing run", async () => {
  const root = await directory()
  const workflow = Workflow.parse({
    version: 1,
    name: "timeout",
    start: "verify",
    steps: [
      {
        id: "verify",
        type: "command",
        timeoutMs: 25,
        command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      },
    ],
  })
  const run = await runHarness(createRun(workflow, "Check", root), { opencode, env: isolatedEnv(root) })
  expect(run.status).toBe("failed")
  const stopped = await runHarness(createRun(workflow, "Check", root), { opencode, signal: AbortSignal.abort() })
  expect(stopped.status).toBe("interrupted")
  expect(stopped.count).toBe(0)
})

test("CLI memory commands persist facts without needing provider credentials", async () => {
  const root = await directory()
  const cli = path.join(import.meta.dir, "../src/cli.ts")
  const added = Bun.spawn([process.execPath, cli, "memory", "add", "Run parser tests", "--project", root], {
    env: isolatedEnv(root),
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = await new Response(added.stdout).text()
  expect(await new Response(added.stderr).text()).toBe("")
  expect(await added.exited).toBe(0)
  expect(JSON.parse(output).content).toBe("Run parser tests")
  const found = Bun.spawn([process.execPath, cli, "memory", "search", "parser", "--project", root], {
    env: isolatedEnv(root),
    stdout: "pipe",
    stderr: "pipe",
  })
  const results = JSON.parse(await new Response(found.stdout).text())
  expect(await new Response(found.stderr).text()).toBe("")
  expect(await found.exited).toBe(0)
  expect(results[0].content).toBe("Run parser tests")
})
