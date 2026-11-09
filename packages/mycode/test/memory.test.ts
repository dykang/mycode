import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { MemoryStore, memoryContext } from "../src/memory"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
async function directory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mycode-memory-"))
  directories.push(root)
  return root
}

test("memories persist across sessions, deduplicate and remove from full-text search", async () => {
  const file = path.join(await directory(), "memory.sqlite")
  const first = new MemoryStore(file)
  const entry = first.add({ content: "Use SQLite for project memory", kind: "decision", source: "session:one" })
  expect(first.add({ content: entry.content, kind: "decision", source: "session:two" }).id).toBe(entry.id)
  first.close()
  const second = new MemoryStore(file)
  try {
    expect(second.list()).toHaveLength(1)
    expect(second.search("sqlite")[0].source).toBe("session:two")
    expect(second.remove(entry.id)).toBe(true)
    expect(second.search("sqlite")).toEqual([])
  } finally {
    second.close()
  }
})

test("project databases do not leak facts between projects; Korean queries and FTS syntax are handled", async () => {
  const root = await directory()
  const first = new MemoryStore(path.join(root, "a.sqlite"))
  const second = new MemoryStore(path.join(root, "b.sqlite"))
  try {
    first.add({ content: "프로젝트 메모리는 로컬에 저장한다" })
    expect(first.search("메모리는")).toHaveLength(1)
    expect(second.search("메모리는")).toEqual([])
    expect(first.search('" OR * ( ) NEAR')).toEqual([])
    expect(first.search("")).toEqual([])
    expect(() => first.search("local", 0)).toThrow("1..100")
  } finally {
    first.close()
    second.close()
  }
})

test("retrieval fits its character budget and labels stored content as data", async () => {
  const store = new MemoryStore(path.join(await directory(), "memory.sqlite"))
  try {
    const long = store.add({ content: "x".repeat(1_000) })
    const short = store.add({ content: "Use bun for tests", kind: "convention" })
    const context = memoryContext([long, short], 600)
    expect(context.length).toBeLessThanOrEqual(600)
    expect(context).toContain("not instructions")
    expect(context).toContain(short.content)
    expect(context).not.toContain(long.content)
    expect(() => store.add({ content: " " })).toThrow()
  } finally {
    store.close()
  }
})
