#!/usr/bin/env bun
import { parseArgs } from "node:util"
import { readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { loadWorkflow, stateDirectory } from "./config"
import { runHarness, readRun } from "./harness"
import { MemoryInput, MemoryStore } from "./memory"
import { developmentWorkflow } from "./preset"
import { createRun } from "./workflow"

const help = `mycode — OpenCode with local memory and verified workflows

  bun mycode init                         Create mycode.yaml without overwriting files
  bun mycode ui                           Start the fork's TUI with the memory plugin
  bun mycode run "task"                    Run plan → implement → verify → review → verify
  bun mycode resume <run-id>               Retry a step interrupted by an execution error
  bun mycode status [run-id]               Inspect durable run state
  bun mycode memory add "fact" --kind decision
  bun mycode memory search "query"
  bun mycode memory list
  bun mycode memory forget <memory-id>
  bun mycode doctor                       Check local runtime and configuration

Options: --project <directory>  --workflow <yaml-or-json>  --opencode <binary>
Agent steps preserve OpenCode permissions. Verification commands run as configured.
`

async function main() {
  const args = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      project: { type: "string" },
      workflow: { type: "string" },
      opencode: { type: "string" },
      kind: { type: "string" },
      source: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  })
  const [command, ...values] = args.positionals
  if (!command || args.values.help) return console.log(help)
  const root = await realpath(path.resolve(args.values.project ?? process.cwd()))
  const workflowFile = path.resolve(root, args.values.workflow ?? "mycode.yaml")
  const cliDirectory = path.resolve(import.meta.dir, "../../cli")
  const opencode = () =>
    args.values.opencode
      ? [args.values.opencode, "--standalone"]
      : [
          process.execPath,
          "--preload",
          Bun.resolveSync("@opentui/solid/preload", cliDirectory),
          path.join(cliDirectory, "src/index.ts"),
          "--standalone",
        ]
  if (command === "init") {
    if (await Bun.file(workflowFile).exists()) throw new Error(`${workflowFile} already exists`)
    await Bun.write(workflowFile, Bun.YAML.stringify(developmentWorkflow(), null, 2))
    console.log(`Created ${workflowFile}. Set verification commands and optional per-step models before running.`)
    return
  }
  if (command === "memory") {
    const memory = new MemoryStore(path.join(stateDirectory(root), "memory.sqlite"))
    try {
      const [action, ...input] = values
      const text = input.join(" ")
      if (action === "add")
        return console.log(
          JSON.stringify(
            memory.add(MemoryInput.parse({ content: text, kind: args.values.kind, source: args.values.source })),
            null,
            2,
          ),
        )
      if (action === "search") return console.log(JSON.stringify(memory.search(text), null, 2))
      if (action === "list") return console.log(JSON.stringify(memory.list(), null, 2))
      if (action === "forget" && text) return console.log(JSON.stringify({ removed: memory.remove(text) }))
      throw new Error("Expected memory add, search, list, or forget")
    } finally {
      memory.close()
    }
  }
  if (command === "status") {
    if (values[0]) return console.log(JSON.stringify(await readRun(root, values[0]), null, 2))
    const directory = path.join(stateDirectory(root), "runs")
    const ids = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    })
    const runs = await Promise.all(
      ids.map(async (id) => {
        const run = await readRun(root, id)
        return { id, status: run.status, steps: run.count, next: run.next, task: run.task }
      }),
    )
    return console.log(JSON.stringify(runs, null, 2))
  }
  if (command === "doctor") {
    const workflow = (await Bun.file(workflowFile).exists()) ? await loadWorkflow(workflowFile) : undefined
    return console.log(
      JSON.stringify(
        {
          bun: Bun.version,
          project: root,
          workflow: workflow?.name ?? "not initialized",
          opencode: opencode(),
          memory: "local SQLite + FTS5",
          plugin: "OpenCode v2, enabled by mycode ui/run",
          credentials: "Use the fork's OpenCode provider login; no model key is bundled",
        },
        null,
        2,
      ),
    )
  }
  if (!["ui", "run", "resume"].includes(command)) throw new Error(`Unknown command ${command}`)
  if (command === "run" && !values.join(" ").trim()) throw new Error("A task is required")
  if (command === "resume" && !values[0]) throw new Error("A run id is required")

  // The inline config is an overlay; existing OpenCode project/global config remains loaded normally.
  const overlay = process.env.OPENCODE_CONFIG_CONTENT ? JSON.parse(process.env.OPENCODE_CONFIG_CONTENT) : {}
  const plugin = path.resolve(import.meta.dir, "..")
  const environment = {
    ...process.env,
    PWD: root,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ ...overlay, plugin: [...(overlay.plugin ?? []), plugin] }),
  }
  if (command === "ui") {
    const child = Bun.spawn(opencode(), {
      cwd: root,
      env: environment,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    process.exitCode = await child.exited
    return
  }
  const state =
    command === "resume"
      ? await readRun(root, values[0])
      : createRun(await loadWorkflow(workflowFile), values.join(" "), root)
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", interrupt)
  console.log(`Run ${state.id}`)
  try {
    const result = await runHarness(state, {
      opencode: opencode(),
      signal: controller.signal,
      report: console.log,
      env: environment,
    })
    console.log(`${result.status}: ${result.id}${result.error ? ` (${result.error})` : ""}`)
    process.exitCode = result.status === "passed" ? 0 : result.status === "interrupted" ? 130 : 1
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
  }
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(String(error))
    process.exitCode = 1
  })
