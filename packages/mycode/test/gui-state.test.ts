import { expect, test } from "bun:test"
import { transitionPage } from "../src/gui-state"
import type { Overview } from "../src/control-contract"

test("a late desktop response cannot overwrite a newer project request", () => {
  const first = transitionPage({ status: "idle", attempt: 0 }, { type: "request" })
  const next = transitionPage(first, { type: "request" })
  expect(transitionPage(next, { type: "failed", attempt: first.attempt, message: "old project failed" })).toBe(next)
  expect(transitionPage(next, { type: "failed", attempt: next.attempt, message: "current failure" })).toMatchObject({
    status: "error",
    message: "current failure",
  })
})

test("refresh retains the visible memory and workflow snapshot until the replacement arrives", () => {
  const data: Overview = { root: "/project", memories: [], workflow: null, runs: [], prune: false, skills: [] }
  const refreshing = transitionPage({ status: "ready", attempt: 1, data }, { type: "request" })
  expect(refreshing.data).toBe(data)
  const failed = transitionPage(refreshing, { type: "failed", attempt: refreshing.attempt, message: "disconnected" })
  expect(failed.data).toBe(data)
  expect(failed.status).toBe("error")
})
