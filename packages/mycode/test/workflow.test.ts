import { expect, test } from "bun:test"
import { Workflow } from "../src/config"
import { advance, createRun } from "../src/workflow"
import { developmentWorkflow } from "../src/preset"
import { checkTerminalPromise } from "../src/completion"
import { decodeAgentOutput } from "../src/process"

const passed = { ok: true, exitCode: 0, output: "pass" }
const failed = { ok: false, exitCode: 1, output: "test failed" }

test("verification failure dynamically routes back to implementation and requires fresh verification after review", () => {
  const workflow = developmentWorkflow(["bun", "test"])
  const start = createRun(workflow, "Fix the parser", "/project")
  const implementation = advance(start, passed)
  const verification = advance(implementation, passed)
  const repair = advance(verification, failed)
  expect(repair.next).toBe("implement")
  expect(repair.results.verify).toEqual(failed)
  const reverify = advance(repair, passed)
  const review = advance(reverify, passed)
  const final = advance(review, passed)
  expect(final.status).toBe("running")
  expect(final.next).toBe("final-verify")
  expect(advance(final, passed).status).toBe("passed")
})

test("repeated failures exhaust the step budget and cannot report success", () => {
  const workflow = developmentWorkflow()
  const state = createRun(workflow, "Fix", "/project")
  let current = advance(state, passed)
  while (current.status === "running") current = advance(current, current.next === "verify" ? failed : passed)
  expect(current.status).toBe("failed")
  expect(current.error).toContain("budget exhausted")
  expect(advance(current, passed)).toBe(current)
})

test.each([
  [
    "duplicate ids",
    {
      start: "a",
      steps: [
        { id: "a", type: "command", command: ["true"] },
        { id: "a", type: "command", command: ["true"] },
      ],
    },
  ],
  ["missing target", { start: "a", steps: [{ id: "a", type: "command", command: ["true"], onFailure: "missing" }] }],
  ["unverified terminal agent", { start: "a", steps: [{ id: "a", type: "agent", prompt: "do work" }] }],
  [
    "unreachable stage",
    {
      start: "a",
      steps: [
        { id: "a", type: "command", command: ["true"] },
        { id: "b", type: "command", command: ["true"] },
      ],
    },
  ],
  ["unbounded-only cycle", { start: "a", steps: [{ id: "a", type: "command", command: ["true"], onSuccess: "a" }] }],
])("rejects %s before execution", (_name, input) => {
  expect(Workflow.safeParse({ version: 1, name: "invalid", ...input }).success).toBe(false)
})

test("completion promises must be on the final line, not quoted in earlier output", () => {
  expect(checkTerminalPromise("Example: <promise>APPROVED</promise>\nNeeds a fix", "APPROVED")).toBe(false)
  expect(checkTerminalPromise("Reviewed\n<promise>APPROVED</promise>\n", "APPROVED")).toBe(true)
})

test("OpenCode error events, incomplete streams and malformed JSON cannot count as successful execution", () => {
  const text = JSON.stringify({ type: "text", part: { text: "done" } })
  const finish = JSON.stringify({ type: "step_finish", part: {} })
  expect(decodeAgentOutput(`${text}\n${finish}`).ok).toBe(true)
  expect(
    decodeAgentOutput(`${text}\n${finish}\n${JSON.stringify({ type: "error", error: { message: "auth required" } })}`)
      .ok,
  ).toBe(false)
  expect(decodeAgentOutput(text).ok).toBe(false)
  expect(decodeAgentOutput("").ok).toBe(false)
  expect(() => decodeAgentOutput("{broken")).toThrow("Malformed")
})
