import { expect, test } from "bun:test"
import type { SessionContext } from "@opencode/plugin/promise/session"
import { pruneContext } from "../src/context"

test("duplicate pruning preserves call IDs, errors, the recent window and original history", () => {
  const text = "same successful output ".repeat(40)
  const messages: SessionContext["messages"] = [
    {
      role: "tool",
      content: [{ type: "tool-result", id: "old", name: "read", result: { type: "text", value: text } }],
    },
    {
      role: "tool",
      content: [{ type: "tool-result", id: "error", name: "read", result: { type: "error", value: text } }],
    },
    { role: "assistant", content: [{ type: "tool-call", id: "new", name: "read", input: {} }] },
    {
      role: "tool",
      content: [{ type: "tool-result", id: "new", name: "read", result: { type: "text", value: text } }],
    },
  ]
  const pruned = pruneContext(messages, 2)
  expect(pruned.count).toBe(1)
  expect(pruned.messages[0].content[0]).toMatchObject({
    id: "old",
    result: { value: "[Duplicate output; same as tool call new]" },
  })
  expect(pruned.messages.slice(1)).toEqual(messages.slice(1))
  expect(messages[0].content[0]).toMatchObject({ result: { value: text } })
  expect(pruneContext(messages, 4).count).toBe(0)
})
