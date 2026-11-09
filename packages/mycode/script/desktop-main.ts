import { app } from "electron"
import path from "node:path"

// This distribution has its own identity and runtime; it never adopts the upstream app's service or update feed.
const runtime = path.join(app.getPath("appData"), "ai.dykang.mycode", "runtime")
process.env.OPENCODE_DESKTOP_APP_NAME = "MyCode"
process.env.OPENCODE_DESKTOP_APP_ID = "ai.dykang.mycode"
process.env.OPENCODE_DESKTOP_RUNTIME_ROOT = runtime
process.env.OPENCODE_DESKTOP_DISABLE_UPDATES = "1"
process.env.OPENCODE_DESKTOP_DISABLE_PROTOCOL_REGISTRATION = "1"
const existing = process.env.OPENCODE_CONFIG_CONTENT ? JSON.parse(process.env.OPENCODE_CONFIG_CONTENT) : {}
process.env.OPENCODE_DESKTOP_CONFIG = JSON.stringify({
  ...existing,
  plugin: [...(existing.plugin ?? []), path.join(process.resourcesPath, "plugins/mycode")],
})
process.env.OPENCODE_CONFIG_CONTENT = process.env.OPENCODE_DESKTOP_CONFIG
for (const name of ["DATA", "CONFIG", "CACHE", "STATE"])
  process.env[`XDG_${name}_HOME`] = path.join(runtime, name.toLowerCase())
await import("../../desktop/src/main/index")
