import { createRequire } from "node:module"
import { mkdtemp, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Operates the installed app, not a browser replica. Model APIs are never called by this deterministic smoke test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const require = createRequire(path.join(root, "packages/app/package.json"))
const { chromium, expect } = require("@playwright/test")
const project = await realpath(await mkdtemp(path.join(os.tmpdir(), "mycode-desktop-qa-")))
const other = await realpath(await mkdtemp(path.join(os.tmpdir(), "mycode-isolation-qa-")))
for (const directory of [project, other]) execFileSync("git", ["init", "-q", directory])
await writeFile(
  path.join(project, "mycode.yaml"),
  `version: 1
name: desktop-verification-demo
start: verify
maxSteps: 8
steps:
  - id: verify
    type: command
    command: [/bin/test, -f, verified.txt]
    onSuccess: final-verify
    onFailure: repair
  - id: repair
    type: command
    command: [/usr/bin/touch, verified.txt]
    onSuccess: verify
  - id: final-verify
    type: command
    command: [/bin/test, -f, verified.txt]
`,
)
const output = path.join(root, "docs/images")
await mkdir(output, { recursive: true })
const browser = await chromium.connectOverCDP(process.env.MYCODE_CDP_URL ?? "http://127.0.0.1:9463", {
  noDefaults: true,
})
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().startsWith("oc://renderer/"))
if (!page) throw new Error("Installed MyCode renderer is unavailable")
page.setDefaultTimeout(15_000)
const checks = []
const pass = (name) => {
  checks.push(name)
  console.log(`PASS ${name}`)
}
const shot = async (name, region = page) => {
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  await region.screenshot({ path: path.join(output, name) })
  console.log(`SNAPSHOT ${name}`)
}
const load = async (directory) => {
  await page.getByRole("textbox", { name: "Project directory", exact: true }).fill(directory)
  await page.getByRole("button", { name: "Load project", exact: true }).click()
  await expect(page.getByText(directory, { exact: true })).toBeVisible()
}
try {
  await page.keyboard.press("Meta+,")
  await page.getByRole("tab", { name: "MyCode", exact: true }).click()
  await load(project)
  await page.getByRole("button", { name: "Memory", exact: true }).click()
  const fact = "Run parser regression tests before changing the grammar."
  await page.getByRole("textbox", { name: "New project fact", exact: true }).fill(fact)
  await page.getByRole("button", { name: "Save memory", exact: true }).click()
  await expect(page.getByText(fact, { exact: true })).toBeVisible()
  pass("save a durable project memory through the installed UI")
  await page.getByRole("searchbox", { name: "Search memories", exact: true }).fill("parser")
  await page.getByRole("button", { name: "Search", exact: true }).click()
  await expect(page.getByText(fact, { exact: true })).toBeVisible()
  await shot("mycode-memory.png")
  pass("lexical memory search returns the persisted fact")
  await page.getByRole("searchbox", { name: "Search memories", exact: true }).fill("")
  await load(other)
  await expect(page.getByText("No matching memories. Save a durable fact to begin.", { exact: true })).toBeVisible()
  await expect(page.getByText(fact, { exact: true })).toHaveCount(0)
  pass("another project cannot see the first project's memory")
  await load(project)
  await expect(page.getByText(fact, { exact: true })).toBeVisible()
  pass("reopening the project retains its memory")
  await page.getByRole("textbox", { name: "New project fact", exact: true }).fill("Temporary desktop QA memory")
  await page.getByRole("button", { name: "Save memory", exact: true }).click()
  const temporary = page.getByRole("article").filter({ hasText: "Temporary desktop QA memory" })
  await expect(temporary).toBeVisible()
  await temporary.getByRole("button", { name: "Forget", exact: true }).click()
  await expect(temporary).toHaveCount(0)
  pass("forget removes exactly the selected memory")
  await page.getByRole("button", { name: "Workflow", exact: true }).click()
  await page.getByRole("textbox", { name: "Task", exact: true }).fill("Local verification smoke test (no model call)")
  await shot("mycode-workflow.png")
  await page.getByRole("button", { name: "Run workflow", exact: true }).click()
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(
      page.getByRole("article").filter({ hasText: "Local verification smoke test (no model call)" }),
    ).toContainText("Passed")
  }).toPass({ timeout: 30_000, intervals: [500, 1000] })
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  const ids = await readdir(path.join(project, ".mycode/runs"))
  if (ids.length !== 1) throw new Error("Expected exactly one smoke run")
  const trace = (await readFile(path.join(project, ".mycode/runs", ids[0], "trace.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((event) => event.type === "step.finished")
  expect(trace.map((event) => [event.step, event.ok])).toEqual([
    ["verify", false],
    ["repair", true],
    ["verify", true],
    ["final-verify", true],
  ])
  await expect(page.getByRole("cell", { name: "Failed", exact: true })).toBeVisible()
  pass("real command failure routes to repair and fresh verification; attempt history is visible")
  await shot(
    "mycode-verification.png",
    page.getByRole("article").filter({ hasText: "Local verification smoke test (no model call)" }),
  )
  await page.getByRole("button", { name: "Context & skills", exact: true }).click()
  const toggle = page.getByRole("switch", { name: "Duplicate tool-output pruning", exact: true })
  await expect(toggle).not.toBeChecked()
  await toggle.press("Space")
  await expect(toggle).toBeChecked()
  expect(JSON.parse(await readFile(path.join(project, ".mycode/context.json"), "utf8")).prune).toBe(true)
  for (const skill of [
    "mycode-verification-before-completion",
    "mycode-systematic-debugging",
    "mycode-test-driven-development",
  ])
    await expect(page.getByText(skill, { exact: true })).toBeVisible()
  pass("pruning is off by default, toggles on durably, and three development skills are visible")
  await shot("mycode-context-skills.png")
  await load(other)
  await expect(toggle).not.toBeChecked()
  await load(project)
  await expect(toggle).toBeChecked()
  pass("context policy persists per project")
  await toggle.press("Space")
  await expect(toggle).not.toBeChecked()
  const report = {
    testedAt: new Date().toISOString(),
    app: "/Applications/MyCode.app",
    bundleId: "ai.dykang.mycode",
    architecture: process.arch,
    project,
    checks,
    modelCalls: 0,
    runId: ids[0],
    trace: trace.map(({ step, attempt, ok, exitCode }) => ({ step, attempt, ok, exitCode })),
  }
  await writeFile(path.join(root, ".mycode/desktop-qa.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
